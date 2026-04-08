use std::io::Result;

fn main() -> Result<()> {
    println!("cargo:rerun-if-changed=proto/core.proto");
    println!("cargo:rerun-if-changed=proto/boost.proto");
    println!("cargo:rerun-if-changed=proto/rewards.proto");
    println!("cargo:rerun-if-changed=proto/token.proto");
    println!("cargo:rerun-if-changed=proto/scarces.proto");

    prost_build::Config::new().compile_protos(
        &[
            "proto/core.proto",
            "proto/boost.proto",
            "proto/rewards.proto",
            "proto/token.proto",
            "proto/scarces.proto",
        ],
        &["proto"],
    )?;

    Ok(())
}
