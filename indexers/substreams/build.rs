use std::io::Result;

fn main() -> Result<()> {
    println!("cargo:rerun-if-changed=proto/core.proto");
    println!("cargo:rerun-if-changed=proto/staking.proto");
    println!("cargo:rerun-if-changed=proto/token.proto");

    prost_build::Config::new()
        .compile_protos(
            &["proto/core.proto", "proto/staking.proto", "proto/token.proto"],
            &["proto"],
        )?;

    Ok(())
}
