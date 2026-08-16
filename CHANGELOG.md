# Changelog

## [0.0.5](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.4...bgg-viewer-v0.0.5) (2026-08-16)


### Features

* **rail:** best-at joins plays-with behind a player-count mode toggle ([6cc947a](https://github.com/phenrickson/bgg-viewer/commit/6cc947a24c8e5cef875df5497d157532494b5cec))
* **rail:** best-at joins plays-with behind a player-count mode toggle ([fbe2b72](https://github.com/phenrickson/bgg-viewer/commit/fbe2b72251159ac8fdf1464dee257e841c6fce28))


### Bug Fixes

* **rail:** facet groups no longer collapse when you search in them ([d9c9566](https://github.com/phenrickson/bgg-viewer/commit/d9c9566acfd29304b50b94b3c083f9a34fb10f26))
* **rail:** facet groups no longer collapse when you search in them ([4f504a0](https://github.com/phenrickson/bgg-viewer/commit/4f504a018a9142c0402a9520446410931bdeb00a))

## [0.0.4](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.3...bgg-viewer-v0.0.4) (2026-08-04)


### Features

* **predictions:** a room for sorting and surfacing upcoming games ([e1299a3](https://github.com/phenrickson/bgg-viewer/commit/e1299a33ae66ef6495b055a934a755679b165ef9))
* **upcoming:** a menu row, and a detail page that shifts with the game ([b3d3e2e](https://github.com/phenrickson/bgg-viewer/commit/b3d3e2ebbf2c1a64c87cafa4166a16bca4fc49cf))


### Bug Fixes

* **predictions:** same encoding for a measure in both universes ([2412a18](https://github.com/phenrickson/bgg-viewer/commit/2412a1845803b205fcf5454e8df26775a5725b42))

## [0.0.3](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.2...bgg-viewer-v0.0.3) (2026-08-04)


### Features

* **ci:** build landing content from BigQuery before the image ([d87bf52](https://github.com/phenrickson/bgg-viewer/commit/d87bf5245fa732004e23f705afdb691a6906ef22))
* **landing:** name games on the clouds, and make the columns argue a point ([2f0e978](https://github.com/phenrickson/bgg-viewer/commit/2f0e978137cb669e4a621d3bd676c9ccd842d512))
* **landing:** quote the wait from this browser's own past loads ([4017848](https://github.com/phenrickson/bgg-viewer/commit/4017848b05196be4815517754d6eaa06ad90081a))
* **landing:** warm-gap sections down the foot of the landing page ([b1ac55c](https://github.com/phenrickson/bgg-viewer/commit/b1ac55cba3cf29b12a049a3db935d916d9b77f21))


### Bug Fixes

* **landing:** restore the space above the Explore door ([495f960](https://github.com/phenrickson/bgg-viewer/commit/495f9601fec168b2f600cc93ff6226fe4e739708))
* **landing:** stratify the scatter samples, and stop the charts overclaiming ([ecbc9d9](https://github.com/phenrickson/bgg-viewer/commit/ecbc9d96a1c6461ba0093491c8fb681d27041be7))

## [0.0.2](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.1...bgg-viewer-v0.0.2) (2026-08-03)


### Features

* **about:** build the two relationship scatters on a Canvas layer ([e88d832](https://github.com/phenrickson/bgg-viewer/commit/e88d8327fd7eef40fe515bef5c1d24e67a3c1f98))
* **about:** move the data primer to its own page ([12f8d59](https://github.com/phenrickson/bgg-viewer/commit/12f8d59af4c116378af384818df377b3e6b32050))
* **auth:** login/register/logout routes; guard the landing page ([2d1e4b0](https://github.com/phenrickson/bgg-viewer/commit/2d1e4b0c78b507f4faa82f03db9232a4a15559a9))
* **catalog:** carry model predictions in the client artifact ([41ed239](https://github.com/phenrickson/bgg-viewer/commit/41ed2391d73b5558fe9390b60f3b29ea0abc6d20))
* **catalog:** expand artifact — player counts, designers, artists, publishers ([029e28b](https://github.com/phenrickson/bgg-viewer/commit/029e28b632eaefed512ac010921c19c87d9a3a84))
* **catalog:** Step 1 — server-materialized catalog artifact ([706d23b](https://github.com/phenrickson/bgg-viewer/commit/706d23b3604e1c000f91723a17cf799b7d264dbd))
* **catalog:** Step 2 — client-side catalog store (DuckDB-WASM) + /games ([47c19a3](https://github.com/phenrickson/bgg-viewer/commit/47c19a3e159a835c3f7a02aff4f52baa38c4cf2a))
* **catalog:** Step 3 — Explore shell (filter rail + URL scope) ([fdcf67e](https://github.com/phenrickson/bgg-viewer/commit/fdcf67edc362a6b9cd3236908979bba182120991))
* **ci:** manual rollback to the stable revision ([5f7715b](https://github.com/phenrickson/bgg-viewer/commit/5f7715b78c60afea2679db29518bda3c86a177f1))
* **ci:** release-please with blue/green Cloud Run deploy ([def08c0](https://github.com/phenrickson/bgg-viewer/commit/def08c0f8e7dce90dbbadf5e03653250049ead12))
* **deploy:** Cloud Run deployment with release-please versioned rollouts ([688b5af](https://github.com/phenrickson/bgg-viewer/commit/688b5afca50e1a9e9f44b216c472b45658980518))
* **deploy:** containerize the adapter-node build ([52ad684](https://github.com/phenrickson/bgg-viewer/commit/52ad6844223ea4093b5f5e79b5f9740533700f1f))
* **detail:** box art, description, publishers; tighten KPIs; compact/collapsible charts ([8125ac7](https://github.com/phenrickson/bgg-viewer/commit/8125ac71afd332bc3042d550ea578307856f8573))
* **detail:** game detail page at /games/[id] ([4d08f85](https://github.com/phenrickson/bgg-viewer/commit/4d08f85ecc693796abb6f860c167a852d2515a2f))
* **detail:** hero + player counts first; back out to the set you came from ([3a357b6](https://github.com/phenrickson/bgg-viewer/commit/3a357b6d94335b218f31e94437627787e1828ce6))
* **detail:** percentile standing per stat, and rank within release year ([0aba3dc](https://github.com/phenrickson/bgg-viewer/commit/0aba3dccae01b632bb0549a5bd9a250e5e30995e))
* **detail:** surface what the warehouse was already sending ([7044747](https://github.com/phenrickson/bgg-viewer/commit/70447472c4616e9813497bfb782ba01595c2b8ab))
* Discover — a simpler on-ramp between Home and Explore ([fd474ea](https://github.com/phenrickson/bgg-viewer/commit/fd474eac2579059b120f8fbe17157112209f76b9))
* **discover:** add the /discover route ([861ba90](https://github.com/phenrickson/bgg-viewer/commit/861ba9074f226d7d2b81502ce026016311d522c2))
* **discover:** add the nav tab and point landing chips at Discover ([4b7e0d6](https://github.com/phenrickson/bgg-viewer/commit/4b7e0d60c4aec69f9af96dabad39c0f6642a3eb3))
* **discover:** add the result row with stubbed art ([bd0cb6b](https://github.com/phenrickson/bgg-viewer/commit/bd0cb6b14e5a2dd21e5879f3a257afde99714b77))
* **discover:** add the three-dial chip strip ([14e0da1](https://github.com/phenrickson/bgg-viewer/commit/14e0da139d99a4728638c2e02358424c140da50c))
* **discover:** add the three-dial vocabulary with verified category values ([3f02490](https://github.com/phenrickson/bgg-viewer/commit/3f024906d18f0c419bb88ff969496d564cb0fbb4))
* **discover:** label the rating column and centre it ([bbac980](https://github.com/phenrickson/bgg-viewer/commit/bbac980178bc775513d459e431ebe429803f0bd2))
* **discover:** reframe as a continuation of the landing page ([2c24af2](https://github.com/phenrickson/bgg-viewer/commit/2c24af2e4f3c849e37ab8ccaf99bf980601c0be1))
* **discover:** settle the page on a single 64rem measure ([a9fd495](https://github.com/phenrickson/bgg-viewer/commit/a9fd495f6c1845c6fa99035aa31fd1bd39803a1b))
* **discover:** shorten the vote labels, show the rating as a meter ([e7482f4](https://github.com/phenrickson/bgg-viewer/commit/e7482f4b74bb4b217c9ce1ff6ba53d76cd7dfc2e))
* **discover:** state the player-count vote in words, in fixed columns ([522dc3c](https://github.com/phenrickson/bgg-viewer/commit/522dc3ccfcba58fc5414d66b683c66321f27668d))
* **explore:** add families to the type-ahead filters ([d5b998f](https://github.com/phenrickson/bgg-viewer/commit/d5b998f8eaeb6e636de5a1de0102a61b19e31269))
* **explore:** aggregate canvas — scope header, chart grid, no scatter ([b5a83bd](https://github.com/phenrickson/bgg-viewer/commit/b5a83bd16dfc359601da8440716bb880983a3ede))
* **explore:** best-at player-count filter + table columns ([1d6357e](https://github.com/phenrickson/bgg-viewer/commit/1d6357e8ef7d6f3436a241dcde1914b6ee4511a2))
* **explore:** filter by how many people have rated a game ([43b94e7](https://github.com/phenrickson/bgg-viewer/commit/43b94e7c75e1f9ba94b1014219168ac99a4719e9))
* **explore:** shape strip + scannable game list; retire the Table|Summary lens ([b0b8e1b](https://github.com/phenrickson/bgg-viewer/commit/b0b8e1b27601d1473598951893291d931db6866f))
* **explore:** Table|Summary lens; global game search in nav ([6c61394](https://github.com/phenrickson/bgg-viewer/commit/6c61394fbc8ffc2224323488376ade6111683299))
* **explore:** type-ahead filters for designers/artists/publishers ([90c99c2](https://github.com/phenrickson/bgg-viewer/commit/90c99c2c9fb96b2a57ab6763ef3a6df5b990ef52))
* **game:** About above player counts, and an ordered vote palette ([53342c0](https://github.com/phenrickson/bgg-viewer/commit/53342c0b30d8fc8c7d3161b257e79f179db65de0))
* **game:** render the model prediction panel ([cda382b](https://github.com/phenrickson/bgg-viewer/commit/cda382be019078fe47a3ced9d62e1a7707b785c2))
* **game:** surface recommended player counts; size up the standing text ([48c5c2e](https://github.com/phenrickson/bgg-viewer/commit/48c5c2ed9770667524be8cb4f501f4f451ab3c32))
* **just:** add a stop recipe for the dev server ([2705413](https://github.com/phenrickson/bgg-viewer/commit/270541364b218c56932a67721610863d02d68aab))
* **just:** add env recipe and config checks to doctor ([d721143](https://github.com/phenrickson/bgg-viewer/commit/d7211437338b6e8ceddbbf8760751f561afa5a07))
* **landing:** add a heavy chip to simple, restore old-but-great to deeper ([87fc48f](https://github.com/phenrickson/bgg-viewer/commit/87fc48f565abef22e5255047f86e9f68fa85b15e))
* **landing:** chips become the hero; add geekMax so a rank band is expressible ([fa7887d](https://github.com/phenrickson/bgg-viewer/commit/fa7887d44cd1e8c22856297db302b2dcfaf06722))
* **landing:** front door — warm catalog, game search, query chips ([5558fd3](https://github.com/phenrickson/bgg-viewer/commit/5558fd3dc0e96fa050f72ed9df53120413940ed1))
* **landing:** one live door, roadmap demoted; bound the narrow rail ([c1ce553](https://github.com/phenrickson/bgg-viewer/commit/c1ce55390f429e0fb07ec770c86036fb2cdbfa12))
* **landing:** route each query chip to the room that can hold it ([c3486f3](https://github.com/phenrickson/bgg-viewer/commit/c3486f37d1c4fa79648437ebdf37ec38467a94dc))
* **nav:** acknowledge a click while the game page loads ([d015831](https://github.com/phenrickson/bgg-viewer/commit/d01583176294ffee0f432332723bbbcf976811e5))
* **nav:** group by dataset, with a menu instead of a second tab bar ([2002840](https://github.com/phenrickson/bgg-viewer/commit/2002840c090223a11b9c3d286dcea99db5c11fd5))
* offline local mode ([bd05462](https://github.com/phenrickson/bgg-viewer/commit/bd054628b599f0bef0e282616349ad0b0fdcde9d))
* **offline:** mirror the catalog to disk and serve it in offline mode ([3e92154](https://github.com/phenrickson/bgg-viewer/commit/3e92154d1e5e928c58acee939163a161cb207946))
* **offline:** render game pages from the cached catalog ([1fc198a](https://github.com/phenrickson/bgg-viewer/commit/1fc198ab39a14dab29284b506c02462cd3042d09))
* **predictions:** carry sample_status through to the game profile ([00dc6f7](https://github.com/phenrickson/bgg-viewer/commit/00dc6f7685c809027e92aac7d56941f7b7d69218))
* scaffold SvelteKit app ([73bebdb](https://github.com/phenrickson/bgg-viewer/commit/73bebdb426e69aa5dd00c8da0afebbb97fb5e08b))


### Bug Fixes

* **charts:** hover read the wrong bin; harden the brush gesture ([683b4fe](https://github.com/phenrickson/bgg-viewer/commit/683b4fe96f02f62e034ff29544f9841b4876ff64))
* **charts:** the y axis was lying; put both series on one scale ([bbb8ae7](https://github.com/phenrickson/bgg-viewer/commit/bbb8ae7ddb8dfd55627af4def1871d018b7d953d))
* **discover:** align complexity badge color with label via shared band index ([53c939b](https://github.com/phenrickson/bgg-viewer/commit/53c939b24e83a9617a753883dabbf51305024e76))
* **discover:** default to rated universe only when URL has no u param ([9d1c6b7](https://github.com/phenrickson/bgg-viewer/commit/9d1c6b77a23d1471f4a339f7fa470ca6e8d8fab0))
* **discover:** group the top of the page by proximity ([aca2f86](https://github.com/phenrickson/bgg-viewer/commit/aca2f86cb9e5f4d5b1917717a24bd5ddc158b3d8))
* **discover:** reclaim row width, unstick the rank, drop the top gap ([1db5ee4](https://github.com/phenrickson/bgg-viewer/commit/1db5ee45ff14435764d4a9d3d89d74e7998c095c))
* **explore:** chart legibility, smooth toggle, table fills space ([a0809bf](https://github.com/phenrickson/bgg-viewer/commit/a0809bf095db03c893f7dab7f936e7baef7535b6))
* **explore:** remove the dead space below the workspace ([5535ce1](https://github.com/phenrickson/bgg-viewer/commit/5535ce10831acf45b7d6eeaeb73ef46d1ca969a3))
* **explore:** the game list ignored the width it was given ([60f3f42](https://github.com/phenrickson/bgg-viewer/commit/60f3f42c636226cfed406bc9a3ff080c3ae25216))
* **game:** don't show another game's rank on an unrated game ([ae3f0a5](https://github.com/phenrickson/bgg-viewer/commit/ae3f0a56e70fb42dc2446d2f5191b6d6630c2b08))
* **game:** order player counts numerically; bound the chart's height ([d8bf261](https://github.com/phenrickson/bgg-viewer/commit/d8bf26189200d5410960c8600d57cf7200207ccf))
* just dev calls vite directly so --open/--port apply ([50c8644](https://github.com/phenrickson/bgg-viewer/commit/50c8644af7940f3da2ab0e68f7d935f738a27938))


### Performance Improvements

* **catalog:** lazy names — plot queries marshal numbers only ([6ac34ad](https://github.com/phenrickson/bgg-viewer/commit/6ac34ad1c0ed58f5848f6731aa3a31dc497bec7f))
