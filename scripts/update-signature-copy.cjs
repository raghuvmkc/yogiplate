const fs = require("fs");
const path = "src/lib/data/catering-catalog.json";
const j = JSON.parse(fs.readFileSync(path, "utf8"));

/**
 * Short, unique, mouth-watering.
 * Weave in signature / chef’s special language.
 * No onion, garlic, mushroom.
 */
const D = {
  "item-mix-veg-pakoras":
    "Chef’s special pakoras — shatter-crisp, spice-fragrant, pure.",
  "item-chili-paneer":
    "House signature chili paneer — fire-kissed and boldly glazed.",
  "item-pani-pooris":
    "Signature street classic — crisp shells with cool chef-spiced water.",
  "item-dahi-vada":
    "Chef’s special — soft lentil rounds in whipped yogurt and spice.",
  "item-mumbai-bhaji":
    "House signature bhaji — butter-rich potatoes, street-stall soul.",
  "item-urad-vadas":
    "Signature crunch — fermented urad batter fried golden.",
  "item-idlis":
    "Chef’s soft idlis — overnight-fermented, cloud-light steam cakes.",
  "item-cauliflower-manchurian":
    "Chef’s special Manchurian — crisp florets in sweet-heat glaze.",
  "item-paneer-tikka-skewers":
    "House signature tikka — char-finished from a slow yogurt marinade.",
  "item-samosa":
    "Signature hand-sealed samosas — flaky pastry, spiced potato heart.",

  "item-italian-green-salad-with-dressing":
    "Chef’s green salad — garden leaves in herb-bright house dressing.",
  "item-greek-salad":
    "Signature Greek bowl — ripe tomato, olives, feta, cool and pure.",
  "item-mozzarella-caprese":
    "Chef’s Caprese — milky mozzarella, sun-ripe tomato, fresh basil.",
  "item-lemon-orzo-pasta-salad-with-peas-and-mint":
    "Signature orzo salad — lemon-glossed with sweet peas and mint.",
  "item-arugula-and-tomatoes-salad":
    "Chef’s arugula toss — peppery greens, juicy tomato, olive oil.",

  "item-alu-gobi":
    "House signature alu gobi — dry-roasted in peanut oil and spice.",
  "item-okra-stir-fry":
    "Chef’s special okra — seared hot until tender-crisp and fragrant.",
  "item-smoky-paneer-makhni":
    "Signature makhni — wood-smoked paneer in silky tomato-cashew gravy.",
  "item-paneer-tikka-masala-gravy":
    "Chef’s special tikka masala — cream tomato curry, pure and lush.",
  "item-chili-paneer-gravy":
    "House signature gravy — paneer in a glossy chili-bright sauce.",
  "item-methi-malai-matar":
    "Chef’s special methi malai — fenugreek and peas in pure cream.",
  "item-alu-methi":
    "Signature alu methi — potatoes sautéed dry with fresh fenugreek.",
  "item-navaratna-koorma":
    "House signature koorma — nine jewels in cashew velvet gravy.",
  "item-palak-paneer":
    "Chef’s palak paneer — spinach purée cradling soft paneer cubes.",
  "item-eggplants-and-paneer-in-fresh-tomato-sauce":
    "Chef’s signature — roasted eggplant and soft paneer in a bright fresh tomato sauce so rich and tangy-sweet it tastes unforgettable.",
  "item-veg-pahadi":
    "Signature pahadi veg — hill spices, high flame, clean finish.",
  "item-thai-green-curry":
    "Chef’s special Thai curry — coconut-rich with fragrant herbs.",
  "item-malai-kofta":
    "House signature kofta — hand-shaped dumplings in lush cream gravy.",
  "item-amritsari-chole":
    "Signature Amritsari chole — chickpeas slow-stewed deep and bold.",
  "item-chickpeas-with-spinach":
    "Chef’s chickpea spinach — hearty, warm-spiced, pure comfort.",
  "item-tofu-crumbles-with-veggies":
    "Signature tofu wok — crumbled tofu and garden veg, tossed clean.",

  "item-toordal-tadka":
    "Chef’s toor tadka — lentils finished with a fragrant pure tempering.",
  "item-whole-moongdal-with-moringa":
    "Signature moong with moringa — nourishing, slow-simmered, sattvic.",
  "item-roasted-moonddal-with-fried-potatoes":
    "Chef’s special dal — roasted moong topped with golden potato cubes.",
  "item-dal-makhni":
    "House signature dal makhni — overnight lentils, spoon-silky butter.",
  "item-rajma":
    "Signature rajma — kidney beans braised long in rich tomato masala.",
  "item-veg-manchow-soup":
    "Chef’s Manchow — hot broth packed with crisp garden vegetables.",
  "item-wanton-soup":
    "Signature wonton soup — delicate dumplings in a clear pure broth.",
  "item-tuardal-khatta-mitha":
    "Chef’s khatta-mitha dal — sweet-sour balance, Gujarati home way.",

  "item-vegetable-biryani":
    "House signature biryani — dum-sealed basmati, perfume in every layer.",
  "item-vegetable-pulao":
    "Chef’s special pulao — ghee-kissed basmati with garden vegetables.",
  "item-peas-pulao":
    "Signature peas pulao — fragrant rice pearled with sweet green peas.",
  "item-cumin-cilantro-rice":
    "Chef’s jeera rice — cumin-tempered basmati, fresh cilantro shower.",
  "item-risotto":
    "Signature risotto — Arborio stirred slowly until creamy al dente.",
  "item-chinese-fried-rice":
    "Chef’s wok fried rice — high heat, bright vegetable bite.",
  "item-thai-jasmine-rice":
    "Signature jasmine rice — steamed fragrant and snow-white.",
  "item-italian-vegetable-rice":
    "Chef’s Italian rice — herb-scented with Mediterranean vegetables.",
  "item-vegetable-khichri":
    "Signature khichri — rice and lentils cooked soft and sattvic.",
  "item-chowmein-chinese-fried-noodles":
    "Chef’s special chowmein — wok noodles with crunchy veg and glaze.",
  "item-thai-pad-noodles":
    "House signature pad noodles — slicked in sweet-savory Thai sauce.",

  "item-whole-wheat-rotis-with-ghee":
    "Chef’s rotis — soft whole wheat brushed warm with pure ghee.",

  "item-pineapple-halwa":
    "Signature pineapple halwa — slow-stirred, ghee-glossed, fragrant.",
  "item-brown-rassogullas":
    "Chef’s brown rasgullas — caramel-kissed chenna in light syrup.",
  "item-malai-chum-chum":
    "House signature chum chum — pillowy milk sweets under soft malai.",
  "item-ras-malai":
    "Chef’s special ras malai — soft discs in saffron chilled milk.",
  "item-chena-rabri":
    "Signature chena rabri — reduced milk, fresh chenna, cardamom.",
  "item-srikhand":
    "Chef’s shrikhand — strained yogurt with saffron and cardamom.",
  "item-kesari-sweet-rice":
    "Signature kesari rice — saffron dessert jeweled with ghee and nuts.",
  "item-gulabjamun":
    "House signature gulab jamun — warm dumplings in rose syrup.",
  "item-kalajamun":
    "Chef’s kala jamun — dark caramel with a deep molasses finish.",
  "item-fruit-custard":
    "Signature fruit custard — chilled cream studded with ripe fruit.",

  "item-coconut-celey-chutney":
    "Chef’s coconut chutney — fresh-ground, cool, and bright.",
  "item-pineapple-chutney":
    "Signature pineapple relish — tangy-sweet with a jewel shine.",
  "item-dates-raisin-chutney":
    "Chef’s date-raisin chutney — sticky, rich, slow-simmered.",

  "item-vegatable-lasanga":
    "House signature lasagna — layered pasta, cheese, slow tomato bake.",
  "item-pasta-in-marinara-sauce":
    "Chef’s marinara pasta — herb-forward sauce, slow-simmered pure.",
  "item-eggplants-and-tofu-in-fresh-basil-tomato-sauce":
    "Chef’s special — roasted eggplant and tofu in basil-bright tomato.",
  "item-minestrone-soup":
    "Signature minestrone — Italian vegetables simmered hearty and clear.",
  "item-yogiplate-special-pumpkin-basil-soup":
    "Yogiplate chef’s special — silky pumpkin blended with fresh basil.",

  "item-poori":
    "Chef’s pooris — puffed golden discs, fried hot and airy.",
  "item-bhatura":
    "Signature bhatura — yeasty dough fried soft and ballooned.",
  "item-focaccia-bread":
    "Chef’s focaccia — olive-oil bake with a crisp herb crust.",
  "item-pav":
    "Signature pav — soft square rolls, tender for bhaji nights.",
  "item-buttered-masala-pav":
    "Chef’s special masala pav — toasted and slicked with spiced butter.",

  "pizza-margherita":
    "Chef’s Margherita — stone-baked tomato, basil, mozzarella.",
  "pizza-cheese":
    "Signature cheese pizza — blistered crust, long pulls of melt.",
  "pizza-smoked_veggie":
    "Chef’s smoked veggie — hand-stretched with garden vegetables.",
  "pizza-artichoke_heart":
    "Signature artichoke pie — tender hearts on Tuscan-herb crust.",
  "pizza-spinach_ricotta_stuffed":
    "Chef’s stuffed pizza — ricotta and spinach sealed, stone-baked.",
  "pizza-chilli_paneer":
    "House signature chili paneer pizza — Indo-Italian stone bake.",
  "pizza-butter_corn":
    "Chef’s butter corn — sweet corn, melted butter, blistered dough.",
  "pizza-pineapple_jalapeno":
    "Signature sweet-heat pizza — pineapple and jalapeño on stone.",
  "pizza-soya_chilli":
    "Chef’s soya chili pizza — plant-powered on a clean stone crust.",

  "pkg-jain-25":
    "Signature Jain feast — starter through sweet, purity-first.",
  "pkg-swami-25":
    "Chef’s sattvic feast — curated clean from starter to dessert.",
  "pkg-pushti-25":
    "Signature seva thali — shuddha vegetarian throughout.",
  "pkg-vegan-25":
    "Chef’s plant-only spread — built bold for Bay Area tables.",
  "pkg-pureveg-25":
    "House signature vegetarian feast — curries, breads, and sweet.",
  "pkg-italian-25":
    "Chef’s Italian package — pasta, salad, bread, dessert.",
};

let n = 0;
const missing = [];
for (const item of j.items) {
  if (D[item.id]) {
    item.description = D[item.id];
    n++;
  } else {
    missing.push(item.id);
  }
}

const allText = j.items
  .map((i) => i.description)
  .join("\n")
  .toLowerCase();
const banned = ["onion", "garlic", "mushroom"];
const hits = banned.filter((w) => allText.includes(w));

const descs = j.items.map((i) => i.description);
const dupes = descs.filter((d, i) => descs.indexOf(d) !== i);

j.seedVersion = "catering-v13-signature-chefs-special";
fs.writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
console.log("Updated", n, "items; seed", j.seedVersion);
if (missing.length) console.log("MISSING", missing);
if (hits.length) console.log("BANNED WORDS FOUND", hits);
if (dupes.length) console.log("DUPLICATE DESCS", [...new Set(dupes)]);
else console.log("No duplicate descriptions");
console.log(
  "Eggplant:",
  j.items.find((x) => x.id === "item-eggplants-and-paneer-in-fresh-tomato-sauce")
    .description
);
