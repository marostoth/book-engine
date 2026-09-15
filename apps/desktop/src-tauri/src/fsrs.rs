//! FSRS-5 Spaced Repetition Scheduling Engine
//! Implements deterministic, local spaced-repetition math without network dependencies.
//! Formulas and default weights match the official py-fsrs 5.1.3 implementation.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum CardState {
    New = 0,
    Learning = 1,
    Review = 2,
    Relearning = 3,
}

impl From<i64> for CardState {
    fn from(val: i64) -> Self {
        match val {
            1 => CardState::Learning,
            2 => CardState::Review,
            3 => CardState::Relearning,
            _ => CardState::New,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum Rating {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

impl TryFrom<u8> for Rating {
    type Error = String;

    fn try_from(val: u8) -> Result<Self, Self::Error> {
        match val {
            1 => Ok(Rating::Again),
            2 => Ok(Rating::Hard),
            3 => Ok(Rating::Good),
            4 => Ok(Rating::Easy),
            other => Err(format!("Invalid rating {}. Expected 1, 2, 3, or 4.", other)),
        }
    }
}

/// FSRS-5 default parameters (19 weights), identical to `DEFAULT_PARAMETERS` in py-fsrs 5.1.3
pub const DEFAULT_WEIGHTS: [f64; 19] = [
    0.40255, 1.18385, 3.173, 15.69105, // w[0..4]: Initial stabilities S0 for Again, Hard, Good, Easy
    7.1949, 0.5345,                     // w[4..6]: Initial difficulty D0 base and exponent factor
    1.4604, 0.0046,                     // w[6..8]: Difficulty update step and mean reversion factor
    1.54575, 0.1192, 1.01925,           // w[8..11]: Stability update on successful recall
    1.9395, 0.11, 0.29605, 2.2698,      // w[11..15]: Stability update on failure (forget)
    0.2315, 2.9898,                     // w[15..17]: Hard penalty and Easy bonus
    0.51655, 0.6621,                    // w[17..19]: Short-term (same-day) stability
];

/// Forgetting curve R(t, S) = (1 + FACTOR * t / S)^DECAY. This FACTOR makes R(S, S) = 0.9.
pub const DECAY: f64 = -0.5;
pub const FACTOR: f64 = 19.0 / 81.0;
/// Target retention for review intervals (90%)
pub const DESIRED_RETENTION: f64 = 0.90;
/// Longest review interval, as in py-fsrs
pub const MAXIMUM_INTERVAL_DAYS: u32 = 36_500;
/// A card rated Again comes back after 10 minutes
pub const AGAIN_DELAY_SECONDS: i64 = 600;

const SECONDS_PER_DAY: i64 = 86_400;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardSchedule {
    pub card_id: String,
    pub state: u8,
    pub stability: f64,
    pub difficulty: f64,
    pub due: i64,
    pub last_review: i64,
    pub reps: i64,
    pub interval_days: u32,
}

/// Computes retrievability probability R given elapsed days and current stability
pub fn calculate_retrievability(elapsed_days: f64, stability: f64) -> f64 {
    if stability <= 0.0 {
        return 0.0;
    }
    (1.0 + FACTOR * elapsed_days.max(0.0) / stability).powf(DECAY)
}

/// Initial stability for a first-time (New) card (at least 0.1)
pub fn initial_stability(rating: Rating) -> f64 {
    DEFAULT_WEIGHTS[rating as usize - 1].max(0.1)
}

/// Initial difficulty for a first-time (New) card (clamped between 1.0 and 10.0)
pub fn initial_difficulty(rating: Rating) -> f64 {
    let w = &DEFAULT_WEIGHTS;
    let grade = rating as u8 as f64;
    (w[4] - (w[5] * (grade - 1.0)).exp() + 1.0).clamp(1.0, 10.0)
}

/// Updates difficulty with linear damping, then mean reversion towards D0(Easy)
pub fn next_difficulty(curr_diff: f64, rating: Rating) -> f64 {
    let w = &DEFAULT_WEIGHTS;
    let grade = rating as u8 as f64;
    let delta = -w[6] * (grade - 3.0);
    let damped = curr_diff + (10.0 - curr_diff) * delta / 9.0;
    (w[7] * initial_difficulty(Rating::Easy) + (1.0 - w[7]) * damped).clamp(1.0, 10.0)
}

/// Computes next stability after a review on a later day. `curr_diff` is the difficulty before the review.
pub fn next_stability(
    curr_diff: f64,
    curr_stab: f64,
    retrievability: f64,
    rating: Rating,
) -> f64 {
    let w = &DEFAULT_WEIGHTS;
    if rating == Rating::Again {
        // Forget stability formula, capped at S / e^(w17 * w18) as in FSRS-5
        let s_forget = w[11]
            * curr_diff.powf(-w[12])
            * ((curr_stab + 1.0).powf(w[13]) - 1.0)
            * ((1.0 - retrievability) * w[14]).exp();
        s_forget.min(curr_stab / (w[17] * w[18]).exp())
    } else {
        // Recall stability formula
        let hard_penalty = if rating == Rating::Hard { w[15] } else { 1.0 };
        let easy_bonus = if rating == Rating::Easy { w[16] } else { 1.0 };

        curr_stab
            * (1.0
                + w[8].exp()
                    * (11.0 - curr_diff)
                    * curr_stab.powf(-w[9])
                    * (((1.0 - retrievability) * w[10]).exp() - 1.0)
                    * hard_penalty
                    * easy_bonus)
    }
}

/// Computes next stability after another review on the same day
pub fn short_term_stability(curr_stab: f64, rating: Rating) -> f64 {
    let w = &DEFAULT_WEIGHTS;
    let grade = rating as u8 as f64;
    curr_stab * (w[17] * (grade - 3.0 + w[18])).exp()
}

/// Calculates the interval in whole days for the desired retention, from 1 day to MAXIMUM_INTERVAL_DAYS
pub fn next_interval_days(stability: f64, desired_retention: f64) -> u32 {
    // R(I, S) = r gives I = S / FACTOR * (r^(1 / DECAY) - 1); at r = 0.9 the interval equals S.
    let r = desired_retention.clamp(0.7, 0.98);
    let interval = (stability / FACTOR * (r.powf(1.0 / DECAY) - 1.0)).round();
    // `as i64` saturates (NaN becomes 0), and the clamp keeps the value inside the u32 range.
    let days = (interval as i64).clamp(1, i64::from(MAXIMUM_INTERVAL_DAYS));
    u32::try_from(days).unwrap_or(MAXIMUM_INTERVAL_DAYS)
}

/// Applies review to a card's current state and returns updated FSRS parameters.
/// Elapsed time counts whole days: a same-day review uses short-term stability, a later review
/// uses the recall or forget formula. Again brings the card back after 10 minutes; Hard, Good,
/// and Easy schedule whole days.
pub fn schedule_card(
    card_id: &str,
    current_state: CardState,
    current_stability: f64,
    current_difficulty: f64,
    current_reps: i64,
    last_review: i64,
    now: i64,
    rating: Rating,
) -> CardSchedule {
    let (next_stab, next_diff) = if current_state == CardState::New {
        (initial_stability(rating), initial_difficulty(rating))
    } else {
        let elapsed_days = (now - last_review).max(0) / SECONDS_PER_DAY;
        // Stability uses the difficulty from before this review.
        let stab = if elapsed_days == 0 {
            short_term_stability(current_stability, rating)
        } else {
            let r = calculate_retrievability(elapsed_days as f64, current_stability);
            next_stability(current_difficulty, current_stability, r, rating)
        };
        (stab, next_difficulty(current_difficulty, rating))
    };

    let (next_state, interval_days) = match (rating, current_state) {
        (Rating::Again, CardState::New | CardState::Learning) => (CardState::Learning, 0),
        (Rating::Again, _) => (CardState::Relearning, 0),
        _ => (CardState::Review, next_interval_days(next_stab, DESIRED_RETENTION)),
    };

    let due = if interval_days == 0 {
        now + AGAIN_DELAY_SECONDS
    } else {
        now + i64::from(interval_days) * SECONDS_PER_DAY
    };

    CardSchedule {
        card_id: card_id.to_string(),
        state: next_state as u8,
        stability: next_stab,
        difficulty: next_diff,
        due,
        last_review: now,
        reps: current_reps + 1,
        interval_days,
    }
}

#[cfg(test)]
mod tests;
