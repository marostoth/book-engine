//! FSRS-4.5 Spaced Repetition Scheduling Engine
//! Implements deterministic, local spaced-repetition math without network dependencies.

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

/// Standard FSRS-4.5 default parameters (17 weights)
pub const DEFAULT_WEIGHTS: [f64; 17] = [
    0.40255, 1.18385, 3.173, 15.69105, // w[0..4]: Initial stabilities S0 for Again, Hard, Good, Easy
    7.1949, 0.5345,                     // w[4..6]: Initial difficulty D0 base and exponent factor
    1.4604, 0.0046,                     // w[6..8]: Difficulty update step and mean reversion factor
    1.54575, 0.1192, 1.01925,           // w[8..11]: Stability update on successful recall
    1.9395, 0.11, 0.29605, 2.2698,      // w[11..15]: Stability update on failure (forget)
    0.2315, 2.9898,                     // w[15..17]: Hard penalty and Easy bonus
];

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
    if elapsed_days <= 0.0 {
        return 1.0;
    }
    // FSRS power law retrievability: R = (1 + 19 * t / (9 * S))^-0.5
    (1.0 + (19.0 / 9.0) * (elapsed_days / stability)).powf(-0.5)
}

/// Initial stability for a first-time (New) card
pub fn initial_stability(rating: Rating) -> f64 {
    let w = &DEFAULT_WEIGHTS;
    match rating {
        Rating::Again => w[0],
        Rating::Hard => w[1],
        Rating::Good => w[2],
        Rating::Easy => w[3],
    }
}

/// Initial difficulty for a first-time (New) card (clamped between 1.0 and 10.0)
pub fn initial_difficulty(rating: Rating) -> f64 {
    let w = &DEFAULT_WEIGHTS;
    let grade = rating as u8 as f64;
    let d0 = w[4] - (grade - 3.0) * w[5];
    d0.clamp(1.0, 10.0)
}

/// Updates difficulty on subsequent reviews with mean-reversion
pub fn next_difficulty(curr_diff: f64, rating: Rating) -> f64 {
    let w = &DEFAULT_WEIGHTS;
    let grade = rating as u8 as f64;
    let delta = -w[6] * (grade - 3.0);
    let next_d = curr_diff + delta * ((10.0 - curr_diff) / 9.0);
    // Mean reversion towards default Good difficulty D0(3) = w[4]
    let reverted = w[7] * w[4] + (1.0 - w[7]) * next_d;
    reverted.clamp(1.0, 10.0)
}

/// Computes next stability after a review
pub fn next_stability(
    curr_diff: f64,
    curr_stab: f64,
    retrievability: f64,
    rating: Rating,
) -> f64 {
    let w = &DEFAULT_WEIGHTS;
    if rating == Rating::Again {
        // Forget stability formula
        let s_forget = w[11]
            * curr_diff.powf(-w[12])
            * ((curr_stab + 1.0).powf(w[13]) - 1.0)
            * ((1.0 - retrievability) * w[14]).exp();
        s_forget.max(0.1).min(curr_stab)
    } else {
        // Recall stability formula
        let hard_penalty = if rating == Rating::Hard { w[15] } else { 1.0 };
        let easy_bonus = if rating == Rating::Easy { w[16] } else { 1.0 };

        let s_recall = curr_stab
            * (1.0
                + (w[8]).exp()
                    * (11.0 - curr_diff)
                    * curr_stab.powf(-w[9])
                    * (((1.0 - retrievability) * w[10]).exp() - 1.0)
                    * hard_penalty
                    * easy_bonus);
        s_recall.max(curr_stab.max(0.1))
    }
}

/// Calculates interval in days targeting desired retention (default 90%)
pub fn next_interval_days(stability: f64, desired_retention: f64) -> u32 {
    if stability <= 0.0 {
        return 1;
    }
    // With R = (1 + 19/9 * I/S)^(-0.5) = r
    // (19/9) * (I/S) = r^(-2) - 1 => I = S * (9/19) * (r^(-2) - 1)
    let r = desired_retention.clamp(0.7, 0.98);
    let factor = (9.0 / 19.0) * (r.powi(-2) - 1.0);
    let interval = (stability * factor).round() as i64;
    interval.max(1) as u32
}

/// Applies review to a card's current state and returns updated FSRS parameters
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
    let (next_state, next_stab, next_diff, interval_days) = match current_state {
        CardState::New => {
            let s0 = initial_stability(rating);
            let d0 = initial_difficulty(rating);
            let state = if rating == Rating::Again {
                CardState::Learning
            } else {
                CardState::Review
            };
            let interval = if rating == Rating::Again {
                0
            } else {
                next_interval_days(s0, 0.90)
            };
            (state, s0, d0, interval)
        }
        _ => {
            let elapsed_days = if last_review > 0 && now > last_review {
                (now - last_review) as f64 / 86400.0
            } else {
                0.0
            };
            let r = calculate_retrievability(elapsed_days, current_stability);
            let next_d = next_difficulty(current_difficulty, rating);
            let next_s = next_stability(next_d, current_stability, r, rating);

            let (state, interval) = if rating == Rating::Again {
                (CardState::Relearning, 0)
            } else {
                (CardState::Review, next_interval_days(next_s, 0.90))
            };
            (state, next_s, next_d, interval)
        }
    };

    // Calculate due timestamp: if interval is 0 (Again), due in 10 minutes (600s); otherwise days * 86400
    let due = if interval_days == 0 {
        now + 600
    } else {
        now + (interval_days as i64 * 86400)
    };

    CardSchedule {
        card_id: card_id.to_string(),
        state: next_state as u8,
        stability: (next_stab * 1000.0).round() / 1000.0,
        difficulty: (next_diff * 1000.0).round() / 1000.0,
        due,
        last_review: now,
        reps: current_reps + 1,
        interval_days,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_card_initial_stabilities() {
        assert!(initial_stability(Rating::Again) < initial_stability(Rating::Good));
        assert!(initial_stability(Rating::Good) < initial_stability(Rating::Easy));
        assert!(initial_difficulty(Rating::Easy) < initial_difficulty(Rating::Again));
    }

    #[test]
    fn test_schedule_progression() {
        let now = 1700000000;
        // Review a new card with Good
        let sched1 = schedule_card("c1", CardState::New, 0.0, 0.0, 0, 0, now, Rating::Good);
        assert_eq!(sched1.state, CardState::Review as u8);
        assert_eq!(sched1.reps, 1);
        assert!(sched1.interval_days >= 1);
        assert!(sched1.due > now);

        // Subsequent review with Good after 3 days
        let now2 = now + 3 * 86400;
        let sched2 = schedule_card(
            "c1",
            CardState::Review,
            sched1.stability,
            sched1.difficulty,
            sched1.reps,
            sched1.last_review,
            now2,
            Rating::Good,
        );
        assert_eq!(sched2.reps, 2);
        assert!(sched2.stability >= sched1.stability);
        assert!(sched2.interval_days >= sched1.interval_days);

        // Forgetting with Again
        let now3 = now2 + sched2.interval_days as i64 * 86400;
        let sched3 = schedule_card(
            "c1",
            CardState::Review,
            sched2.stability,
            sched2.difficulty,
            sched2.reps,
            sched2.last_review,
            now3,
            Rating::Again,
        );
        assert_eq!(sched3.state, CardState::Relearning as u8);
        assert_eq!(sched3.interval_days, 0);
        assert_eq!(sched3.due, now3 + 600);
    }
}
