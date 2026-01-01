use std::io::Result;

fn main() -> Result<()> {
    // Tell cargo to rerun if proto files change
    println!("cargo:rerun-if-changed=proto/onsocial.proto");
    
    // Generate Rust code from protobuf definitions
    prost_build::Config::new()
        .compile_protos(&["proto/onsocial.proto"], &["proto"])?;
    
    Ok(())
}
