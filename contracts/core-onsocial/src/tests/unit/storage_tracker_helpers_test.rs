#[cfg(test)]
mod storage_tracker_helpers_tests {
    use crate::storage::tracker::StorageTracker;
    use crate::tests::test_utils::{get_context, test_account};
    use near_sdk::testing_env;

    #[test]
    fn track_resets_even_without_storage_change() {
        let alice = test_account(0);
        testing_env!(get_context(alice).build());

        let mut tracker = StorageTracker::default();
        let (out, delta) = tracker.track(|| 123u32);

        assert_eq!(out, 123);
        assert_eq!(delta, 0);
        assert!(tracker.is_empty(), "tracker must be reset after track()");
    }

    #[test]
    fn track_result_resets_on_err() {
        let alice = test_account(0);
        testing_env!(get_context(alice).build());

        let mut tracker = StorageTracker::default();
        let res: Result<((), i128), &'static str> = tracker.track_result(|| Err("boom"));

        assert!(res.is_err());
        assert!(
            tracker.is_empty(),
            "tracker must be reset after track_result() Err"
        );
    }
}
