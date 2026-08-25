# Changelog

## [0.0.14](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.13...bgg-viewer-v0.0.14) (2026-08-25)


### Features

* **explore:** add supports-N and best/recommended-at-N player-count charts ([b46bc28](https://github.com/phenrickson/bgg-viewer/commit/b46bc28d3146ff399ccd5c6dfdbf3a99377f1338))
* **explore:** complexity chart, aligned chart frame, segment-aware best-at ([5d0acd6](https://github.com/phenrickson/bgg-viewer/commit/5d0acd63fdb4615691c1c622321f3c7a5ea2481d))
* **landing:** featured-game facts and badges, Explore player-count charts ([e84c0c7](https://github.com/phenrickson/bgg-viewer/commit/e84c0c7a2feadd5fe58bada7f609fd5a1abcd933))
* **landing:** replace featured-game description with facet badges ([06baa8d](https://github.com/phenrickson/bgg-viewer/commit/06baa8d20d0aa02262ac5f91372a37fff611a745))
* **landing:** replace featured-game placeholder with computed facts ([d495ec6](https://github.com/phenrickson/bgg-viewer/commit/d495ec6b9c7021ab7c0ada47fbcb92080b1a91e1))
* **vizzes:** widen the top-N vizzes to 15 rows ([149a60b](https://github.com/phenrickson/bgg-viewer/commit/149a60bf81f8a58c0f6414d94fdf040971715827))


### Bug Fixes

* **explore:** align player-count chart axes and anchor the stacked chart's scale ([a59fe12](https://github.com/phenrickson/bgg-viewer/commit/a59fe12e7b1dd0f7c70637e97960503bdfd455c8))
* **landing:** featured-game layout and truly random daily rotation ([fdce220](https://github.com/phenrickson/bgg-viewer/commit/fdce2206ebc88467fba105b3c9ede745fc35fa91))
* **vizzes:** bucket scatter labels in the axis's own space, not raw x ([4a5649d](https://github.com/phenrickson/bgg-viewer/commit/4a5649d6dbf5428bd60bb35b75ab3b565824fc51))

## [0.0.13](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.12...bgg-viewer-v0.0.13) (2026-08-22)


### Features

* explore scatter improvements and landing viz fixes ([4056dac](https://github.com/phenrickson/bgg-viewer/commit/4056dac72c2afc679ab88c2e9ee0378e5480f5fd))
* **explore:** toggle to hide the scatter backdrop, and show a hovered point's filter status ([4d061ce](https://github.com/phenrickson/bgg-viewer/commit/4d061cebce81140ef37df71563ffbebf0d2db70f))
* **landing:** editorial control over scatter annotations, fix two axis bugs ([c6679e6](https://github.com/phenrickson/bgg-viewer/commit/c6679e6c222cd9d1e5e1250993f41185d58a74ac))
* show the app version in the footer ([6a15535](https://github.com/phenrickson/bgg-viewer/commit/6a1553590f03d37853c29996e9e76e01cc11d2ac))


### Bug Fixes

* **explore:** don't mark a null-column filter match as "selected" ([52e7577](https://github.com/phenrickson/bgg-viewer/commit/52e75776a4e1712ad0a1234bd0849abdc1de40d1))
* **game:** cap the ratings estimate display at &gt;100k ([d7fbcad](https://github.com/phenrickson/bgg-viewer/commit/d7fbcada3151dcc8312a3a0d8b21ff860698a127))
* **landing:** stop the viz rotation from just walking the file order every day ([b088e3d](https://github.com/phenrickson/bgg-viewer/commit/b088e3d0b4516eef1bf12d98030ea8355646c43f))

## [0.0.12](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.11...bgg-viewer-v0.0.12) (2026-08-21)


### Features

* **landing:** viz-module refactor, new chart kinds, and new vizzes ([f4e6041](https://github.com/phenrickson/bgg-viewer/commit/f4e6041a83626777f2d2211e01ab6ed1e4198ebe))


### Bug Fixes

* trigger release-please for the merged landing-viz work ([4e269c1](https://github.com/phenrickson/bgg-viewer/commit/4e269c105f7575c5ba2cbb0e9d6c4b9e3f90b06c))

## [0.0.11](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.10...bgg-viewer-v0.0.11) (2026-08-20)


### Bug Fixes

* **footer:** shrink oversized BGG attribution badge ([3429316](https://github.com/phenrickson/bgg-viewer/commit/34293169ac8f7a4a9a4068a83d57ebbc2c190368))
* **footer:** shrink oversized BGG attribution badge ([9007ec3](https://github.com/phenrickson/bgg-viewer/commit/9007ec32f3d135802e31c8c24b34f36bbbfba2c0))

## [0.0.10](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.9...bgg-viewer-v0.0.10) (2026-08-19)


### Features

* **charts:** click pins the tooltip instead of navigating immediately ([28e562b](https://github.com/phenrickson/bgg-viewer/commit/28e562b90632bed187c911ee0c057efd3be74823))
* **charts:** plot the whole universe, highlight the current filters ([90d4bc4](https://github.com/phenrickson/bgg-viewer/commit/90d4bc499c9a494c3520d20de7cdec3f727b5294))
* **encodings:** converge Discover onto RatingBar, add reference ticks ([1154f69](https://github.com/phenrickson/bgg-viewer/commit/1154f69a2db457bbfc49729e1be9b74dea298671))
* **encodings:** shared ComplexityMeter for Discover and Explore ([1421b53](https://github.com/phenrickson/bgg-viewer/commit/1421b53c9412ff029bc77d43511dfe68123498a1))
* **explore:** add top categories, before top mechanics ([4c359b8](https://github.com/phenrickson/bgg-viewer/commit/4c359b8bea545993868b6e460434582f766e40b8))
* **explore:** default to All rated instead of Top 10,000 ([b209f4a](https://github.com/phenrickson/bgg-viewer/commit/b209f4a64d2be468f4d191d8e1b58148dd6c482d))
* **explore:** read-only analysis panel scoped to the current filters ([345d69c](https://github.com/phenrickson/bgg-viewer/commit/345d69ca0efa814afdc1928d8542fde119901aa8))
* **explore:** swap Analysis with the table instead of appending below ([dbe2140](https://github.com/phenrickson/bgg-viewer/commit/dbe2140b11495f06e1c70702c647737ba26c8401))
* **explore:** top mechanics/families charts in the analysis panel ([992adac](https://github.com/phenrickson/bgg-viewer/commit/992adac0617a098ebfddf56b1863201115380a1a))
* **explore:** trim repeated copy, add fullscreen zoom to the scatters ([b6778e8](https://github.com/phenrickson/bgg-viewer/commit/b6778e8a5b8a2df1472455f734599bf7d68860dc))


### Bug Fixes

* **charts:** clip Scatter's canvas to the plot rectangle ([c283812](https://github.com/phenrickson/bgg-viewer/commit/c283812b4f5ad51dd4a19e3db9226324ef1aad57))
* **charts:** pin Scatter's axis domain instead of auto-fitting to points ([7d0ae6b](https://github.com/phenrickson/bgg-viewer/commit/7d0ae6beca58e481acdf0a910df11661a0bbce6c))
* **explore:** analysis panel no longer crushes the table when opened ([1f7d8aa](https://github.com/phenrickson/bgg-viewer/commit/1f7d8aacdd3fb68fe275c88c67559c87ae8551f9))
* **explore:** animate the chart zoom dialog with the standard pattern ([63dd8a2](https://github.com/phenrickson/bgg-viewer/commit/63dd8a281fe4b1b1716088aad6a6a65aa633232c))
* **explore:** put the view toggle back in .chead's corner ([f9b1eb5](https://github.com/phenrickson/bgg-viewer/commit/f9b1eb5d2946f1f18bada6d042ad1bf1ae9e9af8))
* **explore:** real scatter interactivity, more facets, drop Cards, rename ([b207486](https://github.com/phenrickson/bgg-viewer/commit/b207486f366ab248cec1c188fd52e9b0210dbf04))
* **explore:** show a loading state instead of empty plots on Visualize ([9918842](https://github.com/phenrickson/bgg-viewer/commit/9918842484b25664cadbf5d34b82a66397682b24))
* **explore:** stop Analysis from shrinking the table at all ([80ac7d9](https://github.com/phenrickson/bgg-viewer/commit/80ac7d9e31376efa0e7a7cd1d4cf3cf3ea3ed524))


### Reverts

* **explore:** drop the layout isolation, back to a plain panel ([c420f32](https://github.com/phenrickson/bgg-viewer/commit/c420f32eff59cc2f3e78d7033eae300e4ca768f7))

## [0.0.9](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.8...bgg-viewer-v0.0.9) (2026-08-19)


### Features

* **game-detail:** real box art and a similarity readout for Similar games ([46a0580](https://github.com/phenrickson/bgg-viewer/commit/46a05804b34d470498a86770b45e44d14778836c))
* **thumbnails:** add a separate thumbnails artifact, fetched after the primary catalog ([c8911df](https://github.com/phenrickson/bgg-viewer/commit/c8911dff23b37f8a612a31866fa3f7c30c64cfb8))
* **thumbnails:** real box art via a separate artifact, fetched after the catalog ([51fcad7](https://github.com/phenrickson/bgg-viewer/commit/51fcad78611e0aa0cdffc49e5aedcaf459dbe68c))
* **thumbnails:** show a quiet "loading art" indicator while thumbnails fetch ([6059f28](https://github.com/phenrickson/bgg-viewer/commit/6059f2812e1a5cfd058e6a1bbffc1305e0b5e8d2))


### Bug Fixes

* **landing:** drop the stale static game count from the warming pill ([e305fa7](https://github.com/phenrickson/bgg-viewer/commit/e305fa7cce611a1c1acb445887e592db503e9ecd))
* **nav:** re-sync scope from the URL on every navigation, not just mount ([1c76424](https://github.com/phenrickson/bgg-viewer/commit/1c76424fcdcb49e61d701414dce0fad24bf3884c))
* **ui:** landing typo, discover column headers, muted log out ([f07a440](https://github.com/phenrickson/bgg-viewer/commit/f07a4407692b688ba27dee6e783c510a92ca41d0))
* **ui:** landing typo, Discover column headers, muted log out ([2fb0a66](https://github.com/phenrickson/bgg-viewer/commit/2fb0a665ce24969e9009698981f7bd39d53b0057))

## [0.0.8](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.7...bgg-viewer-v0.0.8) (2026-08-18)


### Features

* **footer:** add Powered by BGG badge ([18f24c8](https://github.com/phenrickson/bgg-viewer/commit/18f24c87fc5bf4c7aa7d337821d9f3ab50bf5d42))
* **footer:** add Powered by BGG badge ([2a82244](https://github.com/phenrickson/bgg-viewer/commit/2a82244cfaa48959b359ccfaa79fc4d2224a2a0a))

## [0.0.7](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.6...bgg-viewer-v0.0.7) (2026-08-18)


### Features

* add What's New page ([c7f2209](https://github.com/phenrickson/bgg-viewer/commit/c7f220989aa695f8d394fb8a39befe7f9350e067))
* **whats-new:** add /whats-new page for recently added games ([357fb2f](https://github.com/phenrickson/bgg-viewer/commit/357fb2f7e37029f2ffef758a2af9c4f7736ee868))
* **whats-new:** add pagination, tier filter, and trend chart ([3f40d7c](https://github.com/phenrickson/bgg-viewer/commit/3f40d7c2129a9f8b9d935a199952a8eed363281a))
* **whats-new:** rename tier badges, fix header polish, add nav entry ([b33b76c](https://github.com/phenrickson/bgg-viewer/commit/b33b76ce44122df61982115ab6c3a9b7448e8fab))

## [0.0.6](https://github.com/phenrickson/bgg-viewer/compare/bgg-viewer-v0.0.5...bgg-viewer-v0.0.6) (2026-08-17)


### Features

* **rail:** complexity range slider in the pinned rail ([989866c](https://github.com/phenrickson/bgg-viewer/commit/989866cbec26e1bd77dee4a63d747c837fb43164))
* **rail:** numeric filters — complexity bands and a year stepper ([e30e094](https://github.com/phenrickson/bgg-viewer/commit/e30e0945efb0aead3d0a71e2fc758a1616315f8f))

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
