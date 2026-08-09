# The actual bug (and the fix)

## Why you only ever saw 2 clients
The app was reading the client name from **field_2384**, but in your Knack
export that field is empty on all but 2 of 10,491 records. The real client
name lives in **field_2308** (e.g. "Icon Solar Power, LLC", "Schmidt's Sausage
Haus", "Buckeye Lake Marina"). When I first "cleaned" the file I kept the wrong
field and deleted the right one — so the dropdown could only ever show 2 names.

Fixed: the data now reads client from field_2308 → **550 real clients**.

## Why images always said "No image"
The image fields (field_2409 etc.) don't contain a URL — they contain an HTML
link like `<a href="https://res.cloudinary.com/...">`. The app was putting that
whole HTML string into `<img src>`, which can't work. 

Fixed: the real URL is now extracted from the href. Images that are actual
images (.jpg/.png/…) display; other attachments (.zip) show as a file link.

## Data reality (so nothing looks "missing")
- 10,491 campaigns, 550 clients
- 169 records have a displayable image
- 1,612 have a downloadable file (zip etc.)
- 8,710 have no attached media — these correctly show "No image"

## Deploy
    cp -r build render.yaml package.json .gitignore  <your repo>/
    git add -A && git commit -m "Fix client field (2308) + image URL extraction"
    git push origin main
Render serves the prebuilt files — no build step, no OOM.
