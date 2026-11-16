// 3D-Motive: echte, gescannte Modelle von Poly Haven (polyhaven.com), alle CC0.
// Das heißt: frei nutzbar, auch kommerziell, ohne Namensnennung. Die Dateien liegen in public/modelle
// (verkleinert: Texturen 1024 px als WebP). Vorschaubilder: public/modelle/<id>.webp, gebaut mit
// "npm run dev" und dann http://localhost:5184/?vorschauBauen öffnen.

export interface ModelDef { id: string; name: string; cat: string }

export const MODEL_CATS = ['Obst und Kuchen', 'Haus und Küche', 'Uhren und Lampen', 'Tiere und Figuren']

export const MODELS: ModelDef[] = [
  { id: 'food_apple_01', name: 'Apfel', cat: 'Obst und Kuchen' },
  { id: 'lemon', name: 'Zitrone', cat: 'Obst und Kuchen' },
  { id: 'food_pomegranate_01', name: 'Granatapfel', cat: 'Obst und Kuchen' },
  { id: 'food_avocado_01', name: 'Avocado', cat: 'Obst und Kuchen' },
  { id: 'croissant', name: 'Croissant', cat: 'Obst und Kuchen' },
  { id: 'strawberry_chocolate_cake', name: 'Erdbeertorte', cat: 'Obst und Kuchen' },
  { id: 'carrot_cake', name: 'Karottenkuchen', cat: 'Obst und Kuchen' },
  { id: 'antique_ceramic_vase_01', name: 'Alte Vase', cat: 'Haus und Küche' },
  { id: 'brass_vase_01', name: 'Messingvase', cat: 'Haus und Küche' },
  { id: 'jug_01', name: 'Krug', cat: 'Haus und Küche' },
  { id: 'pot_enamel_01', name: 'Emailletopf', cat: 'Haus und Küche' },
  { id: 'alarm_clock_01', name: 'Wecker', cat: 'Uhren und Lampen' },
  { id: 'mantel_clock_01', name: 'Kaminuhr', cat: 'Uhren und Lampen' },
  { id: 'wooden_lantern_01', name: 'Laterne', cat: 'Uhren und Lampen' },
  { id: 'rubber_duck_toy', name: 'Quietscheente', cat: 'Tiere und Figuren' },
  { id: 'garden_gnome', name: 'Gartenzwerg', cat: 'Tiere und Figuren' },
  { id: 'concrete_cat_statue', name: 'Katze aus Stein', cat: 'Tiere und Figuren' },
  { id: 'carved_wooden_elephant', name: 'Holzelefant', cat: 'Tiere und Figuren' },
]

/** Teilezahlen der drei Stufen. */
export const STUFEN: [number, string][] = [[24, 'Leicht'], [96, 'Mittel'], [216, 'Schwer']]

export const modelFile = (id: string) => `modelle/${id}.glb`
export const modelThumb = (id: string) => `modelle/${id}.webp`
