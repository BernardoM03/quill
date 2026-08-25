# Quill

Quill is intended to be a GM-configurable D&D 5.5e companion app to use to host character sheets and campaign information, alongside a variety of campaign and worldbuilding tools.

Applications like D&D Beyond can serve to effectively communicate information to the GM and within the party, but has inherent flaws that come with capitalist and consumerist culture that we exist within. Pay walls for homebrew content, subscriptions, and consistent advertisements work to dampen the creative nature of the hobby.

## Design Philosophy

To be frank, I am mostly designing this application to be able to introduce my own homebrew rules without having to deal with guidelines and rules. By designing a D&D character sheet builder and companion app with a configurable ruleset, I can confine strict guidelines that provides my players with set options and encourages creativity within those borders. 

*I also don't have to clarify or double-check the character sheets and make sure all the rules are being followed.*

## Legal

### Quill

Quill is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License, version 3 or later. See [LICENSE](LICENSE).

The AGPL covers Quill's own source code. It does **not** cover the game content packs
under `public/packs/`, which carry their own terms. Each pack declares its license,
attribution, and modification notice in its own `pack.json`, and the app renders those
notices on its Legal page. See [NOTICE](NOTICE) for the full text.

### SRD 5.2.1

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by
Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is
licensed under the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.

Changes were made. The SRD 5.2.1 material in `public/packs/srd-5.2/` has been reformatted
from prose into structured JSON, re-encoded as machine-readable effect data, and annotated
with abridged summaries not present in the original.

### Trademarks

The CC-BY-4.0 license on the SRD grants copyright permissions only. It grants no rights in
any trademark (CC-BY-4.0 s. 2(b)(2)). Dungeons & Dragons, D&D, and Wizards of the Coast are
trademarks of Wizards of the Coast LLC. Quill is not affiliated with, endorsed by, or
sponsored by Wizards of the Coast.

### Contributing content

Only SRD 5.2.1 material belongs in `public/packs/srd-5.2/`. Content from the published
rulebooks is not covered by the Creative Commons license and must not be added — this
includes subclasses beyond the one per class the SRD grants, backgrounds beyond the four,
spells and magic items outside the SRD list, and any monster not in the SRD. Homebrew
belongs in a separate pack with its own manifest.
