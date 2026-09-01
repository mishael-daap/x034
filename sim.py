"""
Edit the INPUT VARIABLES block below, then run the script.
"""

# =====================================================================
# INPUT VARIABLES  -- edit these and re-run
# =====================================================================
target_profit     = 400_000   # total $ operator skims off the top
investment        = 10     # $ deposited per person joining
recruits_per_day  = 10       # new members added per day (flat, operator-driven)
days_to_run       = 60        # how many days the scheme runs before exit
referral_pct      = 20      # % of a new recruit's investment paid to their direct referrer

# Day-1 recruits have no existing member to refer them (no one has joined yet),
# so no referral commission is paid out on day 1. This flag documents that choice.
DAY1_HAS_NO_REFERRER = True

# =====================================================================
# DERIVED SYSTEM VARIABLES
# =====================================================================
total_recruits        = recruits_per_day * days_to_run
skim_per_person        = target_profit / total_recruits
referral_per_person    = investment * referral_pct
net_per_person          = investment - skim_per_person - referral_per_person
daily_interest         = 2 * net_per_person / (days_to_run + 1)
break_even_days        = investment / daily_interest
peak_day_theoretical   = days_to_run / 2  # corrected closed-form (was (days_to_run-1)/2)

print("=" * 70)
print("  DAILY-INTEREST PONZI SCHEME SIMULATOR (with referral commissions)")
print("  Financial Fraud Analysis Tool")
print("=" * 70)
print()
print("[OPERATOR INPUTS]")
print(f"Target profit ($)          : {target_profit:,.2f}")
print(f"Investment per person ($)  : {investment:,.2f}")
print(f"Recruits per day           : {recruits_per_day}")
print(f"Days to run before exit    : {days_to_run}")
print(f"Referral commission (%)    : {referral_pct*100:.1f}%")
print()
print("-" * 70)
print()
print("[SYSTEM OUTPUTS]")
print(f"  Skim per person           : ${skim_per_person:>12,.2f}  ({skim_per_person/investment*100:.1f}% of deposit)")
print(f"  Referral commission/person: ${referral_per_person:>12,.2f}  ({referral_pct*100:.1f}% of deposit)")
print(f"  Net per person (to pool)  : ${net_per_person:>12,.2f}")
print(f"  Daily interest per person : ${daily_interest:>12,.2f}")
print(f"  Total victims recruited   : {total_recruits:>13,.0f}")
print(f"  Break-even for victims    : {break_even_days:>13.1f} days")
print(f"  Pool peaks on day (theory): {peak_day_theoretical:>13.1f}")
print()

# =====================================================================
# DAY-BY-DAY SIMULATION
# =====================================================================
print("-" * 70)
header = f"{'Day':>4} | {'New':>4} | {'Total':>6} | {'Referral':>10} | {'Interest':>10} | {'Pool':>14} | {'Status'}"
print(header)
print(f"{'':>4} | {'Recr':>4} | {'Mmbrs':>6} | {'Paid/Day':>10} | {'Paid/Day':>10} | {'Balance':>14} |")
print("-" * 70)

pool = 0.0
max_pool = 0.0
max_pool_day = 0
total_referral_paid = 0.0
# track cumulative interest + referral income received, per join-day cohort
# NOTE: this tracks TOTAL income for the whole cohort of `recruits_per_day` people
# who joined on that day, not a single individual's income (see FIX below).
member_referral_income = {d: 0.0 for d in range(1, days_to_run + 1)}

for day in range(1, days_to_run + 1):
    # new deposits net of skim and referral go into the pool
    pool += recruits_per_day * net_per_person

    # referral commissions: paid directly from new recruits to an existing member,
    # never touches the pool. Skipped on day 1 (no existing members to refer).
    if day == 1 and DAY1_HAS_NO_REFERRER:
        referral_paid_today = 0.0
    else:
        referral_paid_today = recruits_per_day * referral_per_person
        # distribute today's referral income evenly across all days' recruits so far
        # (simplification: referrers assigned round-robin among existing members)
        existing_members_days = list(member_referral_income.keys())[:day - 1]
        if existing_members_days:
            share = referral_paid_today / len(existing_members_days)
            for d in existing_members_days:
                member_referral_income[d] += share

    total_referral_paid += referral_paid_today

    total_members = recruits_per_day * day
    interest_paid_today = total_members * daily_interest
    pool -= interest_paid_today

    if pool > max_pool:
        max_pool = pool
        max_pool_day = day

    show = (day <= 5 or day >= days_to_run - 2 or
            abs(day - max_pool_day) <= 1 or
            day == int(peak_day_theoretical) or day % 10 == 0)

    if show:
        status = ""
        if day == 1:
            status = "START"
        elif abs(day - max_pool_day) <= 1:
            status = "PEAK"
        elif day == days_to_run:
            status = "EXIT"
        elif day == int(break_even_days):
            status = "BREAK-EVEN"
        print(f"{day:>4} | {recruits_per_day:>4.0f} | {total_members:>6.0f} | "
              f"${referral_paid_today:>9,.2f} | ${interest_paid_today:>9,.2f} | "
              f"${pool:>13,.2f} | {status}")

print("-" * 70)
print(f"\nFinal pool balance      : ${pool:,.2f}")
print(f"Actual peak pool        : ${max_pool:,.2f} on day {max_pool_day}")
print(f"Total referral payouts  : ${total_referral_paid:,.2f}")

# =====================================================================
# VICTIM PROFIT / LOSS BY JOIN DATE (now includes referral income)
# =====================================================================
print()
print("=" * 70)
print("  VICTIM PROFIT / LOSS BY JOIN DATE")
print("=" * 70)
print(f"{'Join':>6} | {'Days':>6} | {'Interest':>11} | {'Referral':>11} | {'Total':>11} | {'Profit/Loss':>12} | {'Outcome'}")
print(f"{'Day':>6} | {'In':>6} | {'Income':>11} | {'Income':>11} | {'Received':>11} | {'':>12} |")
print("-" * 70)
for join_day in [1, 15, 30, 45, 60]:
    days_in = days_to_run - join_day + 1
    interest_income = days_in * daily_interest

    # FIX: member_referral_income[join_day] is the TOTAL referral income earned
    # by the whole cohort of `recruits_per_day` people who joined that day, not
    # one person's income. Dividing by recruits_per_day converts it back to a
    # single individual's referral income so it's comparable to `investment`
    # (one person's deposit) and to `interest_income` (one person's interest).
    referral_income = member_referral_income[join_day] / recruits_per_day

    total_received = interest_income + referral_income
    profit = total_received - investment
    outcome = "WINNER" if profit > 0 else ("BREAK-EVEN" if profit == 0 else "LOSER")
    print(f"{join_day:>6} | {days_in:>6} | ${interest_income:>10,.2f} | ${referral_income:>10,.2f} | "
          f"${total_received:>10,.2f} | ${profit:>11,.2f} | {outcome}")
print("-" * 70)
print(f"\nAnyone joining after day {int(break_even_days):.0f} (interest-only) loses money,")
print("though direct referral income can shift this for members who recruited heavily.")
print(f"Operator walks away with: ${target_profit:,.2f}")
print()
print("=" * 70)
print("  END OF SIMULATION")
print("=" * 70)