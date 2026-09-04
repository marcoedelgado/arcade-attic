// menu.js — the content catalogue: everything read out of crew.json and
// customers.json. One place that knows the shape of those files. Pure apart
// from the random line/roast picks; game.js holds a menu, not a bag of arrays.

import { buildShift } from './shift.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// data: { crew: <parsed crew.json>, customers: <parsed customers.json> }
export function makeMenu(data) {
  const { crew } = data.crew;
  const c = data.customers;

  const toppingLabel = (id) => c.toppings.find((t) => t.id === id)?.label ?? id;
  const toppingEmoji = (id) => c.toppings.find((t) => t.id === id)?.emoji ?? '';

  const donenessWord = (target) => {
    for (const v of c.donenessVocab) if (target <= v.max) return v.word;
    return c.donenessVocab.at(-1).word;
  };

  const syrupWord = (syrup) => {
    if (!syrup) return null;
    return c.syrupChoices.find((choice) => choice.target === syrup.target)?.word ?? 'some syrup';
  };

  return {
    toppings: c.toppings,   // the catalogue array — the topping shelf iterates it

    // 20 customers for one shift; wraps shift.js so nothing else assembles the args
    roster: (rng) => buildShift(
      { crew, toppings: c.toppings, names: c.names, syrupChoices: c.syrupChoices },
      rng,
    ),

    toppingLabel,
    toppingEmoji,
    donenessWord,
    syrupWord,

    ticketText(order) {
      const centre = (order.band[0] + order.band[1]) / 2;
      const parts = [`${donenessWord(centre)} waffle`];
      if (order.toppings.length) parts.push(order.toppings.map(toppingLabel).join(', '));
      const sw = syrupWord(order.syrup);
      if (sw) parts.push(sw);
      return parts.join(' · ');
    },

    // a customer's reaction line — their own pool if they're crew, else the shared one
    line(customer, key) {
      const pool = (customer.kind === 'crew' && customer.lines?.[key]?.length)
        ? customer.lines[key]
        : (c.lines[key] ?? ['…']);
      return pick(pool);
    },

    // the end-of-shift roast for a rating: the filled line plus the crew id who
    // delivers it (their portrait shows on the report card).
    roast(ratingKey, walkers) {
      const speaker = pick(crew);
      const text = pick(c.roasts[ratingKey] ?? c.roasts.rough)
        .replaceAll('{who}', speaker.name)
        .replaceAll('{walkers}', walkers.join(', ') || 'nobody');
      return { text, who: speaker.id };
    },
  };
}
