"""Calculations for the nine narrow Phase 1.1A "situation" checks.

Each function is a pure calculation: given the customer's (or example) figures for one situation, it
returns the numbers a result screen needs. No situation stores anything, calls another service, fabricates
a value the customer didn't provide, or infers a bureau/lender fact. Where a figure cannot be produced
without information the check does not collect (an unknown interest amount, an unknown redemption value,
a lender's actual decision), the corresponding field is `None` and the frontend must say so, never guess.

Ported from the reviewed mockup's own `calculate()` logic (one JS function per situation key), so the
exact figures, comparisons and one-line caveats a stakeholder already reviewed are preserved; the port only
changes where the code runs (server-side, per the project's own rule that financial calculations belong in
the API, not in React) and adds explicit validation with real error messages rather than silent clamping.
"""
from __future__ import annotations

from dataclasses import dataclass, field


class SituationValidationError(ValueError):
    """A specific, customer-facing reason a situation's inputs cannot be calculated."""


def _require_finite_non_negative(name: str, value: float) -> None:
    if value != value or value in (float("inf"), float("-inf")):  # noqa: PLR0124 (NaN check without math import)
        raise SituationValidationError(f"{name} must be a finite number")
    if value < 0:
        raise SituationValidationError(f"{name} must not be negative")
    if value > 1_00_00_00_000:  # ₹100 crore: far beyond any plausible personal monthly figure or loan
        raise SituationValidationError(f"{name} is far larger than this check can usefully compare")


def implied_annual_rate_percent(principal: float, emi: float, months: int) -> float | None:
    """Estimates the annualised reducing-balance rate implied by (principal, emi, months) alone, by
    bisecting the monthly rate that makes the EMI annuity's present value equal the principal.

    Returns None when the three figures cannot imply any non-negative rate at all (a non-positive input,
    or total payments that don't even cover the principal — that combination is rejected before this is
    ever called, via validate_loan_offer, so None here would indicate a caller bypassed validation).
    This is an estimate from the entered figures only: it is never the lender's disclosed APR or effective
    rate, since fees, insurance and payment timing are not part of these three numbers.
    """
    if principal <= 0 or emi <= 0 or months <= 0 or emi * months < principal:
        return None
    if abs(emi * months - principal) < 1e-8:
        return 0.0
    lo, hi = 0.0, 1.0
    for _ in range(90):
        mid = (lo + hi) / 2
        pv = emi * months if mid == 0 else emi * (1 - (1 + mid) ** (-months)) / mid
        if pv > principal:
            lo = mid
        else:
            hi = mid
    return (lo + hi) * 600  # monthly rate -> annual percent: ((lo+hi)/2) * 12 * 100


def _group_indian(digits: str) -> str:
    """Indian digit grouping: last 3 digits, then groups of 2 — "1056000" -> "10,56,000". Matches
    apps/pwa/components/journey-ui/indian.ts's groupIndian, since every rupee figure in this app (frontend
    display and, here, backend-composed sentences alike) uses the same grouping convention, not the
    Western thousands grouping Python's own f"{n:,}" would produce."""
    if len(digits) <= 3:
        return digits
    last3 = digits[-3:]
    rest = digits[:-3]
    groups = []
    while len(rest) > 2:
        groups.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        groups.insert(0, rest)
    return ",".join([*groups, last3])


def _fmt(value: float) -> str:
    sign = "−" if value < 0 else ""
    return f"{sign}₹{_group_indian(str(round(abs(value))))}"


@dataclass(frozen=True)
class SituationBar:
    label: str
    value: float | None
    tone: str


@dataclass(frozen=True)
class SituationResult:
    title: str
    headline: str
    detail: str
    insight: str
    scenario: str
    note: str
    bars: list[SituationBar] = field(default_factory=list)


# --- Borrow Better -------------------------------------------------------------------------------


def validate_rising_emis(income: float, essentials: float, emis: float) -> None:
    for name, value in (("Monthly take-home income", income), ("Essential monthly spending", essentials), ("Total current EMIs", emis)):
        _require_finite_non_negative(name, value)
    if income <= 0:
        raise SituationValidationError("Monthly take-home income must be greater than zero.")


def calculate_rising_emis(*, income: float, essentials: float, emis: float, overdue: str) -> SituationResult:
    room = income - essentials - emis
    cut = min(5000.0, emis)
    if overdue == "yes":
        insight = "If a payment is already overdue, contact the lender promptly and review urgent expenses."
    elif room < 0:
        insight = "The amounts entered exceed income. Review immediate payments and essential costs."
    else:
        share_pct = round(emis / income * 100)
        narrow = room < income * 0.15
        insight = f"Repayments use {share_pct}% of the income you entered. " + (
            "The remaining buffer is narrow." if narrow else "Check whether irregular costs are included."
        )
    return SituationResult(
        title="Monthly room after current commitments",
        headline=f"Short by {_fmt(-room)}" if room < 0 else _fmt(room),
        detail=f"{_fmt(income)} income − {_fmt(essentials)} essentials − {_fmt(emis)} EMIs",
        insight=insight,
        scenario=f"If repayments fell by {_fmt(cut)}, monthly room would be {_fmt(room + cut)}. This is a scenario, not an available refinancing offer.",
        bars=[
            SituationBar("Essentials", essentials, "fee"),
            SituationBar("Current EMIs", emis, "emi"),
            *([SituationBar("Shortfall", -room, "emi")] if room < 0 else [SituationBar("Room left", room, "left")]),
        ],
        note="Shares of entered monthly income; amounts may exceed income.",
    )


def validate_new_purchase(price: float, down: float, emi: float, months: int, income: float, costs: float) -> None:
    for name, value in (
        ("Purchase price", price), ("Amount you could pay upfront", down), ("EMI quoted for this purchase", emi),
        ("Monthly take-home income", income), ("Current EMIs and essential spending", costs),
    ):
        _require_finite_non_negative(name, value)
    if months != int(months) or months <= 0:
        raise SituationValidationError("Tenure must be a whole number of months greater than zero.")
    if income <= 0:
        raise SituationValidationError("Monthly take-home income must be greater than zero.")
    if down > price:
        raise SituationValidationError("Upfront payment cannot exceed the purchase price.")
    if emi <= 0 or emi * months < (price - down):
        raise SituationValidationError(
            "Check the quoted EMI and whole-month tenure: total payments do not cover the amount to finance."
        )


def calculate_new_purchase(*, price: float, down: float, emi: float, months: int, income: float, costs: float) -> SituationResult:
    finance = price - down
    room = income - costs - emi
    alt = max(0.0, emi - 5000)
    insight = f"Amount to finance: {_fmt(finance)}. Your entered EMI over {months} months totals {_fmt(emi * months)} before fees. We do not derive the EMI from the price. "
    insight += "The proposed payment exceeds the room in your figures." if room < 0 else "Add insurance, upkeep and other running costs before deciding."
    return SituationResult(
        title="Purchase and monthly room",
        headline=f"Short by {_fmt(-room)}" if room < 0 else _fmt(room),
        detail=f"{_fmt(income)} income − {_fmt(costs)} current costs − {_fmt(emi)} proposed EMI",
        insight=insight,
        scenario=f"If the EMI were {_fmt(alt)}, room would be {_fmt(room + emi - alt)}. A lower EMI may change tenure and total cost.",
        bars=[
            SituationBar("Current costs", costs, "fee"),
            SituationBar("Proposed EMI", emi, "emi"),
            *([SituationBar("Shortfall", -room, "emi")] if room < 0 else [SituationBar("Room left", room, "left")]),
        ],
        note="The EMI and tenure are the quote you entered; running costs and fees are not included.",
    )


def validate_loan_offer(principal: float, emi: float, months: int, income: float, costs: float) -> None:
    for name, value in (
        ("Loan amount offered", principal), ("Monthly EMI offered", emi),
        ("Monthly take-home income", income), ("Current EMIs and essential spending", costs),
    ):
        _require_finite_non_negative(name, value)
    if months != int(months) or months <= 0:
        raise SituationValidationError("Tenure must be a whole number of months greater than zero.")
    if principal <= 0:
        raise SituationValidationError("Loan amount offered must be greater than zero.")
    if income <= 0:
        raise SituationValidationError("Monthly take-home income must be greater than zero.")
    if emi <= 0 or emi * months < principal:
        raise SituationValidationError("Check the offer amount, EMI and whole-month tenure; these payments must cover the principal.")


def calculate_loan_offer(*, principal: float, emi: float, months: int, income: float, costs: float) -> SituationResult:
    total = emi * months
    interest = total - principal
    rate = implied_annual_rate_percent(principal, emi, months)
    room = income - costs - emi
    room_text = f"short by {_fmt(-room)}" if room < 0 else _fmt(room)
    if rate == 0:
        rate_text = "No interest is implied by these entries, before fees."
    else:
        rate_text = (
            f"Estimated implied annualised reducing-balance rate from these entries: about {rate:.1f}% p.a. "
            "This is not the lender's disclosed APR or effective rate; fees, insurance and payment timing may change the actual cost."
        )
    cut = min(5000.0, emi)
    return SituationResult(
        title="What sits behind the EMI",
        headline=f"{_fmt(interest)} estimated interest",
        detail=f"{_fmt(total)} scheduled repayment over {months} months on {_fmt(principal)} principal",
        insight=f"{rate_text} Monthly room after this EMI: {room_text}.",
        scenario=f"An EMI {_fmt(cut)} lower would change monthly room to {_fmt(room + cut)}. It may also change the total interest or tenure; compare actual offer terms.",
        bars=[SituationBar("Principal", principal, "net"), SituationBar("Estimated interest", interest, "interest")],
        note="Calculated from the amount, EMI and tenure entered. Fee, insurance and repayment timing can change the actual cost.",
    )


def validate_rejected_shortfall(emi: float, income: float, costs: float) -> None:
    for name, value in (("EMI you were considering", emi), ("Monthly take-home income", income), ("Current EMIs and essential spending", costs)):
        _require_finite_non_negative(name, value)
    if income <= 0:
        raise SituationValidationError("Monthly take-home income must be greater than zero.")


def calculate_rejected_shortfall(*, emi: float, income: float, costs: float) -> SituationResult:
    room = income - costs - emi
    cut = min(5000.0, emi)
    return SituationResult(
        title="Monthly scenario for the EMI you had in mind",
        headline=f"Short by {_fmt(-room)}" if room < 0 else f"{_fmt(room)} after the planned EMI",
        detail=f"{_fmt(income)} income − {_fmt(costs)} current costs − {_fmt(emi)} planned EMI",
        insight="This monthly-room scenario cannot explain why the lender declined or offered less. It only tests the EMI you had in mind.",
        scenario=f"If the planned EMI were {_fmt(max(0.0, emi - 5000))}, monthly room would be {_fmt(room + cut)}. This is a scenario, not an approval suggestion.",
        bars=[
            SituationBar("Current costs", costs, "fee"),
            SituationBar("Planned EMI", emi, "emi"),
            *([SituationBar("Shortfall", -room, "emi")] if room < 0 else [SituationBar("Room left", room, "left")]),
        ],
        note="A monthly-room calculation does not indicate credit eligibility.",
    )


# --- Rewards Intelligence -------------------------------------------------------------------------


def validate_annual_fee(redeemed: float, fee: float, interest: float | None) -> None:
    _require_finite_non_negative("Rewards you redeemed", redeemed)
    _require_finite_non_negative("Annual card fee", fee)
    if interest is not None:
        _require_finite_non_negative("Interest paid this year", interest)


def calculate_annual_fee(*, redeemed: float, fee: float, interest: float | None) -> SituationResult:
    net = redeemed - fee
    if interest is None:
        insight = "Interest was not entered; it is separate from this fee comparison."
    else:
        insight = f"You also entered {_fmt(interest)} interest. Cancelling the card would not erase interest already charged."
    insight += " This is not a keep, cancel or upgrade recommendation."
    return SituationResult(
        title="This year's redeemed value versus fee",
        headline=f"Short by {_fmt(-net)}" if net < 0 else f"Ahead by {_fmt(net)}",
        detail=f"{_fmt(redeemed)} redeemed rewards − {_fmt(fee)} annual fee",
        insight=insight,
        scenario=f"If the fee were waived, redeemed value minus fee would be {_fmt(redeemed)}.",
        bars=[SituationBar("Redeemed rewards", redeemed, "rewards"), SituationBar("Annual fee", fee, "fee")],
        note="Based on redeemed value you entered; unused points are excluded.",
    )


def validate_card_fit(spend: float) -> None:
    _require_finite_non_negative("Typical monthly spend in this category", spend)
    if spend <= 0:
        raise SituationValidationError("Enter a monthly category spend greater than zero to compare example earning rates.")


def calculate_card_fit(*, category: str, spend: float) -> SituationResult:
    at_1pct = spend * 0.01
    at_3pct = spend * 0.03
    return SituationResult(
        title="Illustrative earning-rate difference",
        headline=f"{_fmt(at_3pct - at_1pct)} a month in this example",
        detail=f"On {_fmt(spend)} monthly {category.lower()} spend: 1% = {_fmt(at_1pct)}; 3% = {_fmt(at_3pct)}",
        insight="The 1% and 3% rates are made-up examples. Your card might have caps, exclusions or a different redemption value.",
        scenario="Find your issuer's earning rate and exclusions for this category. Then compare the actual terms with your spending.",
        bars=[SituationBar("At example 1%", at_1pct, "fee"), SituationBar("At example 3%", at_3pct, "rewards")],
        note="Illustrative rates applied to the spending amount entered. This does not measure your card.",
    )


def validate_carrying_balance(known: str, interest: float | None, rewards: float) -> None:
    _require_finite_non_negative("Rewards redeemed or valued by issuer in the same period", rewards)
    if known == "yes":
        if interest is None:
            raise SituationValidationError("Enter the interest charged in this statement period, or choose 'No' if you don't know it.")
        _require_finite_non_negative("Interest charged in this statement period", interest)


def calculate_carrying_balance(*, known: str, interest: float | None, rewards: float) -> SituationResult:
    if known == "no":
        return SituationResult(
            title="Rewards and interest in one period",
            headline="Interest cost unknown",
            detail=f"{_fmt(rewards)} reward value entered for this period",
            insight="If interest was charged, it can outweigh rewards. Find the interest amount on the same statement before comparing.",
            scenario="Open the latest statement and look for interest charged and the actual value of rewards redeemed.",
            bars=[SituationBar("Entered reward value", rewards, "rewards")],
            note="No interest estimate has been invented.",
        )
    assert interest is not None  # enforced by validate_carrying_balance
    diff = rewards - interest
    return SituationResult(
        title="Rewards and interest in one period",
        headline=f"{_fmt(-diff)} more interest than rewards" if diff < 0 else f"{_fmt(diff)} more rewards than interest",
        detail=f"{_fmt(rewards)} reward value versus {_fmt(interest)} interest",
        insight="This compares the amounts entered for one statement period. Other fees and redemption rules may still matter.",
        scenario="If there were no interest charge next period, the same reward value would no longer be offset by it. This is a scenario, not a payment instruction.",
        bars=[SituationBar("Reward value", rewards, "rewards"), SituationBar("Interest", interest, "interest")],
        note="Both amounts must cover the same period.",
    )


def validate_multi_card(fee1: float, reward1: float, fee2: float, reward2: float) -> None:
    for name, value in (
        ("First card annual fee", fee1), ("First card rewards redeemed", reward1),
        ("Second card annual fee", fee2), ("Second card rewards redeemed", reward2),
    ):
        _require_finite_non_negative(name, value)


def calculate_multi_card(*, fee1: float, reward1: float, fee2: float, reward2: float) -> SituationResult:
    a = reward1 - fee1
    b = reward2 - fee2
    total = a + b
    return SituationResult(
        title="What redeemed rewards covered",
        headline=(f"Card 1: {'short by ' + _fmt(-a) if a < 0 else 'ahead by ' + _fmt(a)} · " f"Card 2: {'short by ' + _fmt(-b) if b < 0 else 'ahead by ' + _fmt(b)}"),
        detail=f"Combined: {'short by ' + _fmt(-total) if total < 0 else 'ahead by ' + _fmt(total)} after the two fees",
        insight="These totals cannot show category overlap or whether a different card would have earned more on your purchases.",
        scenario=f"If card 2's {_fmt(fee2)} fee were waived, the combined difference would be {_fmt(total + fee2)}. Check issuer terms before making a decision.",
        bars=[
            SituationBar("Card 1 rewards", reward1, "rewards"),
            SituationBar("Card 1 fee", fee1, "fee"),
            SituationBar("Card 2 rewards", reward2, "net"),
            SituationBar("Card 2 fee", fee2, "interest"),
        ],
        note="Only redeemed value and fees you entered are compared.",
    )


def validate_unused_points(points: float, value: float | None, fee: float | None) -> None:
    _require_finite_non_negative("Unused points shown by issuer", points)
    if value is not None:
        _require_finite_non_negative("Issuer-stated cash value", value)
    if fee is not None:
        _require_finite_non_negative("Annual fee", fee)


def calculate_unused_points(*, points: float, value: float | None, fee: float | None) -> SituationResult:
    if points == 0:
        return SituationResult(
            title="Unused points check",
            headline="No unused points entered",
            detail="There is no points balance to value or compare with a fee.",
            insight="If this is correct, there is no unused-points question to check today.",
            scenario="Explore another rewards question if one matters to you.",
            bars=[],
            note="No value or expiry is inferred.",
        )
    if value is None:
        headline = f"{_group_indian(str(round(points)))} points without a cash value"
        detail = "No rupee conversion made"
        insight = "Check your issuer's redemption page for conversion and expiry. The points count alone cannot tell you their rupee value."
        scenario = "Enter the issuer's stated cash value to compare it with any annual fee."
        bars: list[SituationBar] = []
    else:
        headline = f"{_fmt(value)} issuer-stated cash value"
        detail = f"{_group_indian(str(round(points)))} unused points, valued as you entered"
        insight = "Check whether the stated value applies to a redemption you would actually use and when these points expire."
        if fee is None:
            scenario = "With the value you entered, unused value cannot be compared with a fee you have not entered."
        else:
            scenario = f"With the value you entered, unused value is {_fmt(value - fee) + ' above' if value >= fee else _fmt(fee - value) + ' below'} the {_fmt(fee)} fee. Unused points have not been redeemed."
        bars = [SituationBar("Issuer-stated unused value", value, "rewards"), *([SituationBar("Annual fee", fee, "fee")] if fee is not None else [])]
    return SituationResult(
        title="Unused points check", headline=headline, detail=detail, insight=insight, scenario=scenario, bars=bars,
        note="No expiry or cash value is inferred from the points count.",
    )
