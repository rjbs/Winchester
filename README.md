# Winchester

A trainer for scoring cribbage hands.  No cribbage is actually played here:
there's no discard, no crib, no pegging.  You are dealt a cut card and four
cards, over and over, and all you have to do is say what the hand is worth.

A new game sits face down until you press Start, because the opponent's clock
starts when you do and not when the page finished loading.

You peg twelve for every hand you score correctly.  Meanwhile the opponent pegs
twelve every ten seconds, whether or not you're ready.  First to 121 wins, and
then you get a hand-by-hand listing of everything you got right and wrong.

Twelve is a lot for one hand, and that's deliberate: at two points a hand a game
takes 61 correct answers, which is a spelling test rather than a game.  At twelve
it's eleven deals.  The pegs walk to their new hole a hole at a time instead of
teleporting, so a big score reads as progress rather than as a windfall.

## Running it

It's plain static files with no build step and no dependencies, but it does use
ES modules, so it has to be served over HTTP rather than opened from `file://`.

    npm run serve         # python3 -m http.server 8000
    open http://localhost:8000/

Anywhere that serves static files will do, which is how you get it onto a phone.

    npm test              # node --test

## Knobs

The gear in the top corner opens three sliders.  Apply starts a fresh game;
Cancel and Escape leave the one in progress alone, and the opponent doesn't peg
while the dialog is open.

Those settings are the query string, not stored state:

| parameter | effect                                                     |
|-----------|------------------------------------------------------------|
| `?to=48`  | play to 48 instead of 121, to reach the review quickly      |
| `?pace=6` | opponent takes 6 seconds a turn instead of 10               |
| `?pegs=8` | a correct answer is worth 8, and the opponent's turn is too  |

Applying rewrites the URL, so a tuned game survives a reload and a setup you
like can be bookmarked.  Only the values that differ from the defaults show up
there, and typing one by hand works exactly as well as the sliders.

`?pegs=` moves both sides, so the two always need the same number of turns and
changing one number doesn't quietly rig the game.

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

* a "how to play" popover on the pre-game screen
* every third hand is the crib, where a four-card flush doesn't count
* maybe pegging the hand's own value instead of a flat twelve
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

Oh, and nineteen means nothing at all.  The game doesn't say so anywhere; that's
the point of it.
