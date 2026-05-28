import json
import os

CONFIG_PATH = os.environ.get("CONFIG_PATH", os.path.join(os.path.dirname(__file__), "..", "..", "config.json"))

_config: dict | None = None


def load_config() -> dict:
    global _config
    if _config is None:
        with open(CONFIG_PATH, "r") as f:
            _config = json.load(f)
    return _config


def get_secret_key() -> str:
    return load_config().get("secret_key", "")
