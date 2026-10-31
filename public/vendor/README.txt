Сторонні бібліотеки (вендорні файли без збирача). Номер версії — у назві файлу, ліцензії — поруч.

three.js 0.187.0  — three.module-0.187.0.min.js + three.core-0.187.0.min.js (ESM, мініфікація jsDelivr;
                    в three.module шлях імпорту змінено на ./three.core-0.187.0.min.js). Ліцензія: three-LICENSE.txt (MIT).
                    Додатки з examples/jsm тієї ж версії (bloom для 3D-хвилі): three.EffectComposer, three.RenderPass,
                    three.UnrealBloomPass, three.OutputPass, three.ShaderPass, three.MaskPass, three.Pass,
                    three.CopyShader, three.LuminosityHighPassShader, three.OutputShader (-0.187.0.js). Імпорти 'three'
                    і відносні шляхи замінено на файли з цієї папки; решта коду без змін.
GSAP 3.15.0       — gsap-3.15.0.min.js, ScrollTrigger-3.15.0.min.js, SplitText-3.15.0.min.js (з npm, dist). Ліцензія: gsap-LICENSE.txt.
Lenis 1.3.27      — lenis-1.3.27.min.js, lenis-1.3.27.css (з npm, dist). Ліцензія: lenis-LICENSE.txt (MIT).

Оновлення: завантажити нову версію (npm pack або jsDelivr), покласти файли з новим номером,
змінити шляхи в src/views/layout.js (і в public/js/motion.js для three), старі файли видалити.
Файли лежать без підпапок: серверна версія роздає /assets лише на два рівні.
