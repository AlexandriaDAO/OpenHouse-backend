use candid::{CandidType, Deserialize};

#[derive(CandidType, Deserialize)]
pub struct GreetResult {
    pub message: String,
}

#[ic_cdk::query]
fn greet(name: String) -> GreetResult {
    GreetResult {
        message: format!("Hello, {}! Life2 server is currently locked.", name),
    }
}

#[ic_cdk::query]
fn get_status() -> String {
    "locked".to_string()
}

ic_cdk::export_candid!();
