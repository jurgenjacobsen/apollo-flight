---
name: custom-rules
description: A compilation of rules for building UI and apps without having that sloppy look.
license: MIT
metadata:
    author: jurgenjacobsen
    version: "1.0.0"
---

# Custom Rules
Follow this rules whenever building UI or desktop apps as requested by the user. Only override these rules when directly prompted by the user.

## Design & UI
Here are the best practices and preferred approach by the developer.

### Do
1. Try to fill missing micro-states (no focus-visible, disabled, empty, or loading states);
2. Use typography hierarchy, setup display, headings, labels and body text accordingly.
3. Keep transitions under 300ms using custom exponential ease-out curves, and always include reduced-motion alternatives.
4. Try to use other styles of layouts, by default AI tries to use uniquely centered UI's, when possible think about other alternatives.

### Don't
1. Do NOT use raw emoji's, prefer icon libraries currently used in the project, only use it when prompted. If no icon library is available, suggest it;
2. Do NOT use color gradients or too vibrant colors for overall content, only exception for vibrant colors usage would be for accent colors and highlights;
3. Do NOT use arbitrary spacing, such as non-sytem and random padding and margin values, prefer and look for already used spacings and system standard sizes. (If using TailwindCSS prefer default Tailwind spacings)
4. Do NOT use invented metrics, fake statistics (e.g. "10x faster", "99.9% uptime") are banned;
5. Do NOT use lazy filler text (e.g. Lorem ipsum, "Feature One"), use real data or composition choices;
6. Do NOT use "transition: all" in css / tailwind, unless necessary.
7. Do NOT make rounded cards with a colored left-border accent - the canonical "AI dashboard tile" shape. Drop either the radius or the left border.