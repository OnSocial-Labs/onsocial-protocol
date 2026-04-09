mod boost_db_out_tests;
mod boost_decoder_tests;
mod core_decoder_tests;
mod rewards_db_out_tests;
mod rewards_decoder_tests;
mod scarces_db_out_tests;
mod scarces_decoder_tests;
mod token_db_out_tests;
mod token_decoder_tests;

// Integration tests: mock Block → block_walker → decoder → typed output
mod block_walker_tests;
mod boost_pipeline_tests;
mod combined_pipeline_tests;
mod core_pipeline_tests;
mod mock_block;
mod rewards_pipeline_tests;
mod scarces_pipeline_tests;
mod token_pipeline_tests;

// On-chain fixture tests: real EVENT_JSON from testnet transactions
mod onchain_fixture_tests;
