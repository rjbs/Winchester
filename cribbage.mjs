// The rules of cribbage scoring, and just enough of a deck to deal from.  This
// began as Cribbage.mjs from my 2022 cribbage spike; the scoring engine is
// substantially unchanged, because it was right.

const _suit = {
  Clubs:    { marker: "♣", value: 1, red: false },
  Diamonds: { marker: "♦", value: 2, red: true  },
  Hearts:   { marker: "♥", value: 3, red: true  },
  Spades:   { marker: "♠", value: 4, red: false },
};

const _ranks = [
  "A",
  "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "J", "Q", "K",
];

export class Deck {
  constructor() {
    this._cards = [];
    for (const suit of Object.keys(_suit)) {
      for (const rank of _ranks) {
        this._cards.push(new Card(rank, suit));
      }
    }
  }

  shuffle() {
    for (let i = this._cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ this._cards[i], this._cards[j] ] = [ this._cards[j], this._cards[i] ];
    }

    return this;
  }

  pick(n) {
    if (n > this._cards.length) {
      throw new Error(`can't pick ${n} cards from a deck of ${this._cards.length}`);
    }

    return this._cards.splice(0, n);
  }

  replace(cards) {
    // Like many other bits, this does nothing to ensure you're not bringing in
    // bogus cards. -- rjbs, 2022-07-23
    this._cards = this._cards.concat(cards);
  }
}

export class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
  }

  sumValue() {
    if (this.rank === 'K' || this.rank === 'Q' || this.rank === 'J') {
      return 10;
    }

    if (this.rank === 'A') {
      return 1;
    }

    return parseInt(this.rank);
  }

  runValue() {
    if (this.rank === 'A') return 1;
    if (this.rank === 'K') return 13;
    if (this.rank === 'Q') return 12;
    if (this.rank === 'J') return 11;

    return parseInt(this.rank);
  }

  totalOrder() {
    return this.runValue() * 10 + _suit[this.suit].value;
  }

  // The text-presentation suit character, not the emoji one.  The emoji
  // variation selector turns these into full-color glyphs that ignore the
  // surrounding text color, which is no good when the renderer wants to pick
  // red or black itself. -- claude, 2026-08-07
  get glyph() {
    return _suit[ this.suit ].marker;
  }

  get isRed() {
    return _suit[ this.suit ].red;
  }

  toString() {
    return(this.rank + this.glyph);
  }
}

export class ScoreBoard {
  #finalized = false;

  constructor () {
    this._scores = [];
  }

  addScore(hit) {
    if (this.#finalized) throw new Error("can't score onto a finalized ScoreBoard");

    this._scores.push(hit);
  }

  finalize() {
    this.#finalized = true;
  }

  get hits() {
    return [ ...this._scores ]; // Unhappy with this. -- rjbs, 2022-07-23
  }

  get score() {
    return this._scores.reduce((i, hit) => hit.score + i, 0);
  }
}

export class Hand {
  #scoreBoard;

  #didMulti = {};    // found a 2-4 card set of all one rank; key is rank
  #didRun = new Set; // found a 3-5 run; this is a Set with all cards in runs

  // A Hand is a starter card plus the four cards held.  Pass `isCrib` when the
  // four cards are the crib, where a four-card flush doesn't count.
  constructor(starter, cards, { isCrib = false } = {}) {
    this.starter = starter;
    this.cards = cards;
    this.isCrib = isCrib;
  }

  static ez (handString, opts = {}) {
    // Total hack. -- rjbs, 2022-07-21
    const pairs = handString.split(/\s+/);

    let cards = [];

    const suitFor = {
      C: "Clubs",
      D: "Diamonds",
      H: "Hearts",
      S: "Spades",
    };

    for (const pair of pairs) {
      let [rank, suit] = pair;
      if (rank === 'T') rank = '10';

      cards.push(new Card(rank, suitFor[suit]));
    }

    return new Hand(cards[0], cards.slice(1), opts);
  }

  #powerSet(arr) {
    // This is a naive implementation of power set, but since we have exactly 5
    // elements, it won't matter. -- rjbs, 2022-07-21
    const totalCount = 2 ** arr.length;
    const bits = arr.map((_, i) => 2 ** i);

    let powerSet = [];

    for (let i = 1; i < totalCount; i++) {
      powerSet.push(
        bits.flatMap((b,j) => i & b ? arr[j] : [])
      )
    }

    return powerSet;
  }

  get #sortedSubsets() {
    const allSets = this.#powerSet([ this.starter, ...this.cards ]);
    allSets.forEach(set => set.sort((a,b) => a.totalOrder() - b.totalOrder()));
    allSets.sort((a,b) => b.length - a.length);
    return allSets;
  }

  #howMany(set, test) { return set.filter(test).length; }
  #allLike(set, test) { return this.#howMany(set, test) == set.length; }

  #considerNobs() {
    const wantSuit = this.starter.suit;

    const nobs = this.cards.find(c => c.rank === 'J' && c.suit === wantSuit);

    if (nobs) {
      this.#scoreBoard.addScore({
        type : "His Nobs",
        cards: [ this.starter, nobs ],
        score: 1,
      });
    }
  }

  #considerMultiples(set) {
    if (
      set.length >= 2
      && !this.#didMulti[ set[0].rank ]
      && this.#allLike(set, c => c.rank === set[0].rank)
    ) {
      this.#didMulti[ set[0].rank ] = true;

      const typeName = {
        2: "Pair",
        3: "Pair Royal",
        4: "Double Pair Royal",
      };

      this.#scoreBoard.addScore({
        type : typeName[set.length],
        subtype: set[0].rank,
        cards: set,
        score: set.length * (set.length - 1) // 2, 6, 12
      });
    }
  }

  #considerRuns(set) {
    if (set.length >= 3) {
      let isRun = true;
      for (let i = 0; i < set.length - 1; i++) {
        if (set[i].runValue() !== set[i+1].runValue() - 1) {
          isRun = false;
          break;
        }
      }

      if (isRun && !this.#allLike(set,c => this.#didRun.has(c))) {
        const typeName = {
          3: "Run of Three",
          4: "Run of Four",
          5: "Run of Five",
        };

        set.forEach(c => this.#didRun.add(c));
        this.#scoreBoard.addScore({
          type : typeName[set.length],
          cards: set,
          score: set.length,
        });
      }
    }
  }

  #considerFifteens(set) {
    if (set.reduce((i, c) => i + c.sumValue(), 0) === 15) {
      this.#scoreBoard.addScore({
        type : "Fifteen",
        cards: set,
        score: 2,
      });
    }
  }

  #considerFiveCardFlush(set) {
    if (set.length === 5 && this.#allLike(set, c => c.suit === set[0].suit)) {
      this.#scoreBoard.addScore({
        type : "Five Card Flush",
        cards: set,
        score: 5,
      });
    }
  }

  #considerHandFlush() {
    if (this.isCrib) return;

    if ( this.starter.suit !== this.cards[0].suit
      && this.#allLike(this.cards, c => c.suit === this.cards[0].suit)
    ) {
      this.#scoreBoard.addScore({
        type : "Hand Flush",
        cards: this.cards,
        score: 4,
      });
    }
  }

  get score() {
    return this.scoreBoard.score;
  }

  get scoreBoard() {
    if (this.#scoreBoard !== undefined) return this.#scoreBoard;
    this.#scoreBoard = new ScoreBoard()

    this.#considerHandFlush();

    for (const set of this.#sortedSubsets) {
      this.#considerMultiples(set);
      this.#considerRuns(set);
      this.#considerFifteens(set);
      this.#considerFiveCardFlush(set);
    }

    this.#considerNobs();

    this.#scoreBoard.finalize();
    return this.#scoreBoard;
  }

  toString() {
    let string = this.starter.toString();
    string += "  |";

    for (const card of this.cards) {
      string += "  ";
      string += card.toString();
    }

    return string;
  }
}
