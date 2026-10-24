The workflows inherited from PhotoCraft (macOS signing and notarisation, SonarCloud, FreeBSD, Nix,
nightly perf, release) built apps that no longer exist and used the upstream team's secrets, so they
were removed. `ci.yml` checks the Rust engine and the TypeScript interface. Release packaging for
PhotoDesign (an Electron installer around `desktop/`) is not set up yet.
