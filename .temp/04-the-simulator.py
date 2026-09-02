# ============================================================
# INPUT PARAMETERS (edit these values)
# ============================================================
ACTIVE_UNITS = 133              # N — current number of active units
ENERGY_GENERATED_PER_UNIT = 10  # E — one-time energy payout when a unit is acquired
SCORE_PERCENTAGE = 0.20         # p — fraction of E permanently banked as score (0 to 1)
COMMISSION_PERCENTAGE = 0.3     # c — fraction of E paid to the recruiting unit (0 to 1)
UPKEEP_PERCENTAGE = 0.05        # u — fraction of E owed per unit, per day, as upkeep (0 to 1)

TARGET_SCORE = 5000             # simulation stops once cumulative score reaches this value
MAX_DAYS = 10_000               # safety limit to prevent an infinite loop


# ============================================================
# FUNCTION DEFINITION
# ============================================================
def minimum_units_to_acquire(
    active_units: float,
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

    return (active_units * upkeep_percentage) / denominator


# ============================================================
# DAILY SIMULATION
# ============================================================
def run_simulation():
    active_units = ACTIVE_UNITS
    cumulative_score = 0.0
    total_energy_in_system = 0.0

    print(f"{'Day':>5} | {'Score':>15} | {'Total Energy':>15} | {'Units To Recruit':>17}")
    print("-" * 60)

    day = 0
    while cumulative_score < TARGET_SCORE and day < MAX_DAYS:
        day += 1

        units_to_recruit = minimum_units_to_acquire(
            active_units,
            ENERGY_GENERATED_PER_UNIT,
            SCORE_PERCENTAGE,
            COMMISSION_PERCENTAGE,
            UPKEEP_PERCENTAGE
        )

        energy_generated_today = units_to_recruit * ENERGY_GENERATED_PER_UNIT
        score_gained_today = energy_generated_today * SCORE_PERCENTAGE

        cumulative_score += score_gained_today
        total_energy_in_system += energy_generated_today
        active_units += units_to_recruit

        print(f"{day:>5} | {cumulative_score:>15,.2f} | {total_energy_in_system:>15,.2f} | {units_to_recruit:>17,.2f}")

    if cumulative_score >= TARGET_SCORE:
        print(f"\nTarget score of {TARGET_SCORE:,} reached on day {day}.")
    else:
        print(f"\nStopped after {MAX_DAYS:,} days without reaching target score.")


# ============================================================
# EXECUTION
# ============================================================
if __name__ == "__main__":
    run_simulation()