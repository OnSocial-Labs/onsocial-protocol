use crate::*;
use near_sdk::serde_json::Value;

#[near]
impl RewardsContract {
    #[handle_result]
    pub fn execute(&mut self, request: Request) -> Result<Value, RewardsError> {
        self.dispatch_action(request.action)
    }
}
