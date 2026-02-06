use std::io::Result;

fn main() -> Result<()> {
    println!("cargo:rerun-if-changed=proto/onsocial.proto");
    println!("cargo:rerun-if-changed=proto/staking.proto");

    prost_build::Config::new()
        .compile_protos(
            &["proto/onsocial.proto", "proto/staking.proto"],
            &["proto"],
        )?;

    Ok(())
}
