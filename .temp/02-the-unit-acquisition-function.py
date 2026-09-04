# ============================================================
# INPUT PARAMETERS (edit these values)
# ============================================================
ACTIVE_UNITS = 100              # N — current number of active units
ENERGY_GENERATED_PER_UNIT = 10  # E — one-time energy payout when a unit is acquired
SCORE_PERCENTAGE = 0.20         # p — fraction of E permanently banked as score (0 to 1)
COMMISSION_PERCENTAGE = 0.3     # c — fraction of E paid to the recruiting unit (0 to 1)
UPKEEP_PERCENTAGE = 0.03        # u — fraction of E owed per unit, per day, as upkeep (0 to 1)


# ============================================================
# FUNCTION DEFINITION
# ============================================================
def minimum_units_to_acquire(
    active_units: int,
    energy_generated_per_unit: float,
    score_percentage: float,
    commission_percentage: float,
    upkeep_percentage: float
) -> float:
    """
    Returns the minimum number of new units that must be acquired today
    so that today's net surplus energy covers today's total upkeep cost
    for all active units (existing + newly acquired).
    """
    net_surplus_fraction = 1 - score_percentage - commission_percentage
    denominator = net_surplus_fraction - upkeep_percentage

    if denominator <= 0:
        raise ValueError(
            "Not sustainable: net surplus fraction (1 - p - c) must exceed "
            "upkeep_percentage (u), otherwise no acquisition rate can keep the system afloat."
        )

    units_acquired_min = (active_units * upkeep_percentage) / denominator
    return units_acquired_min
    


# ============================================================
# EXECUTION
# ============================================================
result = minimum_units_to_acquire(
    active_units=ACTIVE_UNITS,
    energy_generated_per_unit=ENERGY_GENERATED_PER_UNIT,
    score_percentage=SCORE_PERCENTAGE,
    commission_percentage=COMMISSION_PERCENTAGE,
    upkeep_percentage=UPKEEP_PERCENTAGE,
)

print(f"Minimum units to acquire today: {result}")