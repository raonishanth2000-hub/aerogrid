import unittest
import pandas as pd

from aerogrid.config import FEATURE_COLUMNS
from aerogrid.fetch_data import normalize_concentration, normalize_pollutant, extract_timestamp
from aerogrid.features import make_model_features
from aerogrid.predict import haversine_km


class AeroGridCoreTests(unittest.TestCase):
    def test_pollutant_normalization(self):
        self.assertEqual(normalize_pollutant("PM2.5"), "pm25")
        self.assertEqual(normalize_pollutant("pm10"), "pm10")

    def test_unit_conversion(self):
        self.assertEqual(normalize_concentration(35, "µg/m³"), 35.0)
        self.assertEqual(normalize_concentration(0.035, "mg/m³"), 35.0)
        self.assertIsNone(normalize_concentration(35, "ppm"))

    def test_neighbor_features_exclude_target_location(self):
        frame = pd.DataFrame([
            {"location_id": "A", "location_name": "A", "latitude": 12.90, "longitude": 77.50,
             "timestamp_utc": "2026-01-01T00:00:00Z", "pollutant": "pm25", "value_ugm3": 20,
             "temperature_2m": 28, "relative_humidity_2m": 60, "wind_speed_10m": 7,
             "wind_direction_10m": 180, "pressure_msl": 1010},
            {"location_id": "B", "location_name": "B", "latitude": 12.91, "longitude": 77.51,
             "timestamp_utc": "2026-01-01T00:00:00Z", "pollutant": "pm25", "value_ugm3": 40,
             "temperature_2m": 28, "relative_humidity_2m": 60, "wind_speed_10m": 7,
             "wind_direction_10m": 180, "pressure_msl": 1010},
            {"location_id": "C", "location_name": "C", "latitude": 12.92, "longitude": 77.52,
             "timestamp_utc": "2026-01-01T00:00:00Z", "pollutant": "pm25", "value_ugm3": 30,
             "temperature_2m": 28, "relative_humidity_2m": 60, "wind_speed_10m": 7,
             "wind_direction_10m": 180, "pressure_msl": 1010},
        ])
        target = frame.iloc[[0]].copy()
        features = make_model_features(target, frame)
        self.assertEqual(features.iloc[0]["neighbor_count"], 2)
        self.assertNotAlmostEqual(features.iloc[0]["nearest_neighbor_pm"], 20.0)
        self.assertEqual(features.shape[1], len(FEATURE_COLUMNS))

    def test_extract_timestamp_shape_a_flat_datetimefrom(self):
        """Shape A: top-level datetimeFrom dict — the older v3 format."""
        item = {
            "datetimeFrom": {"utc": "2024-06-01T08:00:00Z", "local": "2024-06-01T13:30:00+05:30"},
            "value": 28.4,
        }
        self.assertEqual(extract_timestamp(item), "2024-06-01T08:00:00Z")

    def test_extract_timestamp_shape_b_nested_period_object(self):
        """Shape B: period is a dict containing datetimeFrom — the newer v3 format."""
        item = {
            "period": {
                "label": "2024-06-01T08:00:00Z",
                "interval": "01:00:00",
                "datetimeFrom": {"utc": "2024-06-01T08:00:00Z", "local": "2024-06-01T13:30:00+05:30"},
            },
            "value": 35.1,
        }
        self.assertEqual(extract_timestamp(item), "2024-06-01T08:00:00Z")

    def test_extract_timestamp_shape_c_top_level_datetime(self):
        """Shape C: top-level datetime dict (end-of-period marker, common in recent responses)."""
        item = {
            "datetime": {"utc": "2024-06-01T09:00:00Z", "local": "2024-06-01T14:30:00+05:30"},
            "value": 22.7,
        }
        self.assertEqual(extract_timestamp(item), "2024-06-01T09:00:00Z")

    def test_extract_timestamp_period_string_falls_through_to_shape_c(self):
        """When period is a plain string (e.g. 'hourly') it must be skipped silently,
        and the function must still find the datetime key (Shape C)."""
        item = {
            "period": "hourly",
            "datetime": {"utc": "2024-06-01T09:00:00Z", "local": "2024-06-01T14:30:00+05:30"},
            "value": 18.0,
        }
        self.assertEqual(extract_timestamp(item), "2024-06-01T09:00:00Z")

    def test_extract_timestamp_returns_none_when_no_timestamp_key(self):
        """An item with no recognisable timestamp key must return None, not raise."""
        self.assertIsNone(extract_timestamp({"value": 12.0}))

    def test_extract_timestamp_prefers_utc_over_local(self):
        """UTC string must be preferred over the local string when both are present."""
        item = {
            "datetimeFrom": {
                "utc": "2024-06-01T08:00:00Z",
                "local": "2024-06-01T13:30:00+05:30",
            }
        }
        result = extract_timestamp(item)
        self.assertTrue(result.endswith("Z"), f"Expected UTC timestamp ending in Z, got: {result}")

    def test_openaq_v3_nested_response_parsing(self):
        """End-to-end parse of a representative nested OpenAQ v3 /sensors/{id}/hours item.

        This uses a structurally realistic response shape — not a real API call.
        The values are chosen to exercise unit conversion (µg/m³ stays unchanged,
        mg/m³ is multiplied by 1000) and to verify that an unrecognised unit is rejected.
        No real pollution measurements are fabricated here.
        """
        # Realistic Shape B item (period dict + concentration in µg/m³)
        item_ugm3 = {
            "sensorsId": 99999,
            "period": {
                "label": "2024-09-15T06:00:00Z",
                "interval": "01:00:00",
                "datetimeFrom": {"utc": "2024-09-15T06:00:00Z", "local": "2024-09-15T11:30:00+05:30"},
                "datetimeTo":   {"utc": "2024-09-15T07:00:00Z", "local": "2024-09-15T12:30:00+05:30"},
            },
            "coverage": {"expectedCount": 60, "observedCount": 58, "percentComplete": 96.7},
            "value": 47.3,
            "parameter": {"id": 2, "name": "pm25", "units": "µg/m³", "displayName": "PM2.5"},
        }
        ts = extract_timestamp(item_ugm3)
        self.assertEqual(ts, "2024-09-15T06:00:00Z")
        concentration = normalize_concentration(item_ugm3["value"], item_ugm3["parameter"]["units"])
        self.assertAlmostEqual(concentration, 47.3)

        # Same shape but with mg/m³ units — must be converted to µg/m³
        item_mgm3 = dict(item_ugm3)
        item_mgm3["value"] = 0.0473
        item_mgm3["parameter"] = {**item_ugm3["parameter"], "units": "mg/m³"}
        concentration_converted = normalize_concentration(item_mgm3["value"], item_mgm3["parameter"]["units"])
        self.assertAlmostEqual(concentration_converted, 47.3, places=3)

        # Unknown unit must be rejected (returns None) rather than silently mixed in
        self.assertIsNone(normalize_concentration(47.3, "ppm"))
        self.assertIsNone(normalize_concentration(47.3, "ppb"))
        self.assertIsNone(normalize_concentration(47.3, ""))

    def test_haversine_same_point_is_zero(self):
        self.assertAlmostEqual(haversine_km(12.97, 77.59, 12.97, 77.59), 0.0, places=6)


if __name__ == "__main__":
    unittest.main()
