"""Unit tests for AeroGrid Amazon S3 and SageMaker AI AWS integration."""
from __future__ import annotations

import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from aerogrid.aws import (
    get_bucket_name, get_sagemaker_sklearn_image, package_code_for_sagemaker,
    upload_file_to_s3, download_file_from_s3, launch_sagemaker_training_job,
    verify_iam_identity, create_or_get_sagemaker_role, generate_iam_policy_templates,
)


class AeroGridAWSTests(unittest.TestCase):
    def test_get_bucket_name_raises_when_empty(self):
        with patch("aerogrid.aws.S3_BUCKET_NAME", ""):
            with self.assertRaises(ValueError):
                get_bucket_name("")

    def test_get_bucket_name_returns_provided_or_configured(self):
        self.assertEqual(get_bucket_name("my-custom-bucket"), "my-custom-bucket")

    def test_sagemaker_sklearn_image_uri(self):
        image_mumbai = get_sagemaker_sklearn_image("ap-south-1")
        self.assertIn("720646828776.dkr.ecr.ap-south-1.amazonaws.com", image_mumbai)
        self.assertIn("sagemaker-scikit-learn", image_mumbai)

        image_us = get_sagemaker_sklearn_image("us-east-1")
        self.assertIn("683313688378.dkr.ecr.us-east-1.amazonaws.com", image_us)

    def test_package_code_for_sagemaker(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_tar = Path(tmpdir) / "test_source.tar.gz"
            package_code_for_sagemaker(out_tar)
            self.assertTrue(out_tar.exists())

            with tarfile.open(out_tar, "r:gz") as tar:
                names = tar.getnames()
                self.assertTrue(any(n.startswith("aerogrid") for n in names))

    @patch("aerogrid.aws.get_s3_client")
    def test_upload_file_to_s3(self, mock_get_client):
        mock_s3 = MagicMock()
        mock_get_client.return_value = mock_s3

        with tempfile.NamedTemporaryFile() as tmp:
            tmp_path = Path(tmp.name)
            tmp_path.write_text("sample content")

            uri = upload_file_to_s3(tmp_path, "data/test.csv", bucket="test-bucket")
            self.assertEqual(uri, "s3://test-bucket/data/test.csv")
            mock_s3.upload_file.assert_called_once_with(str(tmp_path), "test-bucket", "data/test.csv")

    @patch("aerogrid.aws.get_s3_client")
    def test_download_file_from_s3(self, mock_get_client):
        mock_s3 = MagicMock()
        mock_get_client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as tmpdir:
            dest = Path(tmpdir) / "downloaded.csv"
            res = download_file_from_s3("data/test.csv", dest, bucket="test-bucket")
            self.assertEqual(res, dest)
            mock_s3.download_file.assert_called_once_with("test-bucket", "data/test.csv", str(dest))

    @patch("aerogrid.aws.get_sagemaker_client")
    @patch("aerogrid.aws.upload_file_to_s3")
    def test_launch_sagemaker_training_job_submission(self, mock_upload, mock_get_sm):
        mock_sm = MagicMock()
        mock_get_sm.return_value = mock_sm
        mock_upload.side_effect = lambda path, key, bucket: f"s3://{bucket}/{key}"

        result = launch_sagemaker_training_job(
            pollutant="pm25",
            instance_type="ml.m5.large",
            bucket="test-bucket",
            role_arn="arn:aws:iam::123456789012:role/SageMakerRole",
            wait=False,
        )

        self.assertEqual(result["status"], "Submitted")
        self.assertTrue(result["job_name"].startswith("aerogrid-pm25-"))
        mock_sm.create_training_job.assert_called_once()
        call_kwargs = mock_sm.create_training_job.call_args[1]
        self.assertEqual(call_kwargs["RoleArn"], "arn:aws:iam::123456789012:role/SageMakerRole")
        self.assertEqual(call_kwargs["ResourceConfig"]["InstanceType"], "ml.m5.large")

    @patch("aerogrid.aws.get_sts_client")
    def test_verify_iam_identity(self, mock_get_sts):
        mock_sts = MagicMock()
        mock_get_sts.return_value = mock_sts
        mock_sts.get_caller_identity.return_value = {
            "Account": "123456789012",
            "Arn": "arn:aws:iam::123456789012:user/aerogrid-dev",
            "UserId": "AIDAWEXAMPLE",
        }

        res = verify_iam_identity()
        self.assertEqual(res["Account"], "123456789012")
        self.assertEqual(res["Arn"], "arn:aws:iam::123456789012:user/aerogrid-dev")

    @patch("aerogrid.aws.get_iam_client")
    def test_create_or_get_sagemaker_role_existing(self, mock_get_iam):
        mock_iam = MagicMock()
        mock_get_iam.return_value = mock_iam
        mock_iam.get_role.return_value = {
            "Role": {"Arn": "arn:aws:iam::123456789012:role/AeroGridSageMakerExecutionRole"}
        }

        role_arn = create_or_get_sagemaker_role(role_name="AeroGridSageMakerExecutionRole")
        self.assertEqual(role_arn, "arn:aws:iam::123456789012:role/AeroGridSageMakerExecutionRole")
        mock_iam.create_role.assert_not_called()

    @patch("time.sleep")
    @patch("aerogrid.aws.get_iam_client")
    def test_create_or_get_sagemaker_role_creates_new(self, mock_get_iam, mock_sleep):
        mock_iam = MagicMock()
        mock_get_iam.return_value = mock_iam
        mock_iam.exceptions.NoSuchEntityException = Exception
        mock_iam.get_role.side_effect = mock_iam.exceptions.NoSuchEntityException("Not found")
        mock_iam.create_role.return_value = {
            "Role": {"Arn": "arn:aws:iam::123456789012:role/AeroGridSageMakerExecutionRole"}
        }

        role_arn = create_or_get_sagemaker_role(
            role_name="AeroGridSageMakerExecutionRole",
            bucket="test-bucket",
        )
        self.assertEqual(role_arn, "arn:aws:iam::123456789012:role/AeroGridSageMakerExecutionRole")
        mock_iam.create_role.assert_called_once()
        mock_iam.attach_role_policy.assert_called_once()
        mock_iam.put_role_policy.assert_called_once()

    def test_generate_iam_policy_templates(self):
        policies = generate_iam_policy_templates(bucket="aerogrid-bucket-test")
        self.assertIn("developer_policy", policies)
        self.assertIn("sagemaker_trust_policy", policies)
        self.assertIn("sagemaker_permissions_policy", policies)
        self.assertIn("aerogrid-bucket-test", str(policies["developer_policy"]))


if __name__ == "__main__":
    unittest.main()
