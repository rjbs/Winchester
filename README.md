# Winchester

A trainer for scoring cribbage hands.  No cribbage is actually played here:
there's no discard, no crib, no pegging.  You are dealt a cut card and four
cards, over and over, and all you have to do is say what the hand is worth.

You peg two for every hand you score correctly.  Meanwhile the opponent pegs
two every ten seconds, whether or not you're ready.  First to 121 wins, and then
you get a hand-by-hand listing of everything you got right and wrong.

## Running it

It's plain static files with no build step and no dependencies, but it does use
ES modules, so it has to be served over HTTP rather than opened from `file://`.

    npm run serve         # python3 -m http.server 8000
    open http://localhost:8000/

Anywhere that serves static files will do, which is how you get it onto a phone.

    npm test              # node --test

## Knobs

Two query parameters, both mostly for development:

| parameter | effect                                          |
|-----------|-------------------------------------------------|
| `?to=8`   | play to 8 instead of 121, to reach the review    |
| `?pace=4` | opponent pegs two every 4 seconds instead of 10  |

Ten seconds is the default because four isn't survivable.  At two points every
four seconds the opponent pegs out in 242 seconds, and 61 correct hands in 242
seconds means under four seconds a hand, including reading the cards.

## The pieces

| file           | what's in it                                            |
|----------------|---------------------------------------------------------|
| `cribbage.mjs` | the rules: `Card`, `Deck`, `Hand`, `ScoreBoard`           |
| `game.mjs`     | pegs, the opponent's clock, the hand log; no DOM          |
| `render.mjs`   | data in, DOM out: the board, the cards, the scorecard     |
| `ui.mjs`       | events, screens, the touch keypad; the entry point        |

`game.mjs` takes its clock as an argument, so the opponent's pacing and the win
condition are tested in node rather than by staring at a browser.

`cribbage.mjs` is the 2022 `Cribbage.mjs` with its bugs fixed.  `Hand` takes an
`isCrib` option that suppresses the four-card flush; nothing sets it yet.

## Still to come

* a way to change the opponent's speed without editing the URL
* every third hand is the crib, where a four-card flush doesn't count
* maybe pegging the hand's own value instead of a flat two
* naming the hands instead of totalling them

That last one existed in the 2022 command-line version, where you could answer
`ffp` instead of `6`.  Its token table is worth keeping:

| token | meaning           | worth |
|-------|-------------------|-------|
| `f`   | fifteen           | 2     |
| `p`   | pair              | 2     |
| `p3`  | pair royal        | 6     |
| `p4`  | double pair royal | 12    |
| `r3`  | run of three      | 3     |
| `r4`  | run of four       | 4     |
| `r5`  | run of five       | 5     |
| `s`   | four-card flush   | 4     |
| `S`   | five-card flush   | 5     |
| `n`   | his nobs          | 1     |

Grading that answer means comparing a multiset of claimed combinations against
`ScoreBoard#hits`, which is the whole reason the scorer reports hits and not
just a number.

Oh, and nineteen means nothing at all.
