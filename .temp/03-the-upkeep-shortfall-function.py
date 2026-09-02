# ============================================================
# INPUT PARAMETERS (edit these values)
# ============================================================
ACTUAL_UNITS_RECRUITED = 10     # x — units actually recruited (may be less than the sustaining minimum)
ACTIVE_UNITS = 133              # N — active units before this recruitment
ENERGY_GENERATED_PER_UNIT = 10  # E — one-time energy payout when a unit is acquired
SCORE_PERCENTAGE = 0.20         # p — fraction of E permanently banked as score (0 to 1)
COMMISSION_PERCENTAGE = 0.3     # c — fraction of E paid to the recruiting unit (0 to 1)
UPKEEP_PERCENTAGE = 0.05        # u — fraction of E owed per unit, per day, as upkeep (0 to 1)


# ============================================================
# FUNCTION DEFINITION
# ============================================================
def upkeep_payable_and_shortfall(
    actual_units_recruited: float,   # x — units actually recruited (may be less than the sustaining minimum)
    active_units: float,             # N — active units before this recruitment
    energy_generated_per_unit: float,
    score_percentage: float,
    commission_percentage: float,
    upkeep_percentage: float
) -> tuple[float, float]:
    """
    Returns (upkeep_payable, upkeep_shortfall) for a given actual recruitment number,
    which may fall short of the sustaining minimum.
    """
    net_surplus_fraction = 1 - score_percentage - commission_percentage
    net_surplus_actual = actual_units_recruited * net_surplus_fraction * energy_generated_per_unit

    total_units_after = active_units + actual_units_recruited
    total_upkeep_owed = total_units_after * upkeep_percentage * energy_generated_per_unit

    upkeep_payable = min(net_surplus_actual, total_upkeep_owed)
    upkeep_shortfall = max(total_upkeep_owed - net_surplus_actual, 0)

    return upkeep_payable, upkeep_shortfall


# ============================================================
# EXECUTION
# ============================================================
upkeep_payable, upkeep_shortfall = upkeep_payable_and_shortfall(
    actual_units_recruited=ACTUAL_UNITS_RECRUITED,
    active_units=ACTIVE_UNITS,
    energy_generated_per_unit=ENERGY_GENERATED_PER_UNIT,
    score_percentage=SCORE_PERCENTAGE,
    commission_percentage=COMMISSION_PERCENTAGE,
    upkeep_percentage=UPKEEP_PERCENTAGE,
)

print(f"Upkeep payable today:  {upkeep_payable:,.2f}")
print(f"Upkeep shortfall today: {upkeep_shortfall:,.2f}")