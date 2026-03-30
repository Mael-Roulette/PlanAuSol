# PlanAuSol

Outil de plan au sol pour tournages audiovisuels. Pose des caméras, lumières, micros, personnes et mobilier sur un canvas interactif, puis exporte en PNG.

---

## Stack

Vanilla JS + HTML/CSS, zéro dépendance. Pas de build, pas de framework, pas de node_modules.


---

## Structure des fichiers

```
├── index.html
├── style.css
├── script.js
└── images/
    ├── camera.webp
    ├── fresnel.webp
    ├── led.webp
    ├── dome.webp
    ├── micro.webp
    └── people.webp
```

> Les chemins vers les images sont hardcodés dans `script.js`. Gardez bien la structure `images/` à la racine.

---

## Stockage

Les plans sont sauvegardés en **localStorage** côté navigateur. Pas de backend, pas de base de données.
- Sauvegarde manuelle via le bouton "Sauvegarder"
- Autosave automatique toutes les 30 secondes
- Le dernier plan ouvert est restauré au rechargement

---

## Pas de config

Pas de `.env`, pas de variables à configurer.

---

*Par [Maël Roulette](mailto:contact@mael-roulette.fr)*