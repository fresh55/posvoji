"""Validation for profile corrections available in the maintainer's admin."""

from django.core.exceptions import ValidationError

COAT_COLORS = ("black", "white", "grey", "brown", "orange", "cream")
COAT_CATEGORIES = (
    *COAT_COLORS,
    "black-white",
    "brown-white",
    "grey-white",
    "orange-white",
    "cream-white",
    "multicolour",
)
COAT_LENGTHS = ("short", "medium", "long", "hairless")
LIFE_STAGES = ("young", "adult", "senior")
MEDICAL_BOOLEANS = ("vaccinated", "neutered", "microchipped")
MEDICAL_TESTS = ("fiv", "felv")
REQUIREMENTS = (
    "indoorOnly",
    "bondedPair",
    "experiencedCarer",
    "ongoingCare",
    "onlyPet",
    "noYoungKids",
)


def validate_coat_colors(value):
    if (
        not isinstance(value, list)
        or not 1 <= len(value) <= 6
        or any(color not in COAT_COLORS for color in value)
        or len(set(value)) != len(value)
    ):
        raise ValidationError("Choose one to six distinct supported coat colors.")


def validate_medical(value):
    if not isinstance(value, dict) or not value:
        raise ValidationError("Medical corrections must be a non-empty object.")
    for key, answer in value.items():
        if key in MEDICAL_BOOLEANS and type(answer) is bool:
            continue
        if key in MEDICAL_TESTS and answer in ("positive", "negative", "unknown"):
            continue
        raise ValidationError("Use supported medical fields and typed answers.")


def validate_requirements(value):
    if (
        not isinstance(value, dict)
        or not value
        or any(
            key not in REQUIREMENTS or type(answer) is not bool
            for key, answer in value.items()
        )
    ):
        raise ValidationError(
            "Use supported adoption requirements and boolean answers."
        )
