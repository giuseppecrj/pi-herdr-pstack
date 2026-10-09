# Third-party notices

## pi-herdr-agents

`LICENSE` comes unchanged from
[pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents) at commit
`c2177dff835da44937e614e8a03d0405d442e848`. Wave 1 also moved
`agents/poteto.md` from that commit; Wave 2 removed it. See
[docs/provenance.md](docs/provenance.md) for each file.

pi-herdr-agents is distributed under the MIT License with this notice, retained
from its upstream lineage
([HazAT/pi-interactive-subagents](https://github.com/HazAT/pi-interactive-subagents)
and [0xRichardH/pi-herdr-subagents](https://github.com/0xRichardH/pi-herdr-subagents)):

```text
MIT License

Copyright (c) 2026 HazAT

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

New files in this package are offered under the same MIT terms.

## Upstream pstack

Every file under `skills/` is copied or adapted from pstack, from two pinned
sources. Wave 2 shipped `skills/poteto-mode/` and `skills/setup-pstack/`; Wave 3
shipped the other 35 skills and the comment-sicko delegate prompt at
`skills/no-comments/references/comment-sicko.md`:

- [casualjim/pi-mimir](https://github.com/casualjim/pi-mimir) at commit
  `f07dd981f62c9c994a5d043ede67d6c63c721454`, path `packages/pi-pstack/skills`.
  The package directory carries Lauren Tan's MIT notice; the repository root
  carries Ivan Porto Carrero's MIT notice.
- [cursor/plugins](https://github.com/cursor/plugins) at commit
  `ccb5507cec1546dc88135c1139c811e6c59115ba`, path `pstack/skills`, under
  Lauren Tan's MIT notice. The previous pin was
  `2cbf58508f40de470d7490b55c51d71241928fa2`. `pstack/LICENSE` is unchanged
  between those commits. See [docs/provenance.md](docs/provenance.md).

See [docs/provenance.md](docs/provenance.md) and
`test/fixtures/skill-provenance/` for each file's sources and hashes.

```text
MIT License

Copyright (c) 2026 Lauren Tan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

```text
MIT License

Copyright (c) 2026 Ivan Porto Carrero

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Short quoted examples in `technical-writing`

`skills/technical-writing/SKILL.md` is copied byte-for-byte from the pinned
pi-mimir source, and its text remains under the upstream MIT notices above. It
contains two short example sentences quoted from third-party style guides. They
are attributed here; the copied skill bytes are not changed.

- "How to calibrate the radar array" (the How-to paragraph, line 43) is the
  how-to guide title example from Diátaxis by Daniele Procida,
  <https://diataxis.fr/how-to-guides/>, licensed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- "If hot oil touches your skin, injuries can occur." (the warning-placement
  rule, line 69) is the example from the ASD-STE100 Simplified Technical English
  FAQ, <https://www.asd-ste100.org/STE_faq.html>.
