// The site's own origin. Link previews need absolute URLs, a static export has
// no request to derive one from, and what a visitor shares out of a preview
// build should still be the address the animal actually lives at.
export const SITE_URL = "https://posvoji.si";

// Where the code lives. The footer's mark, the about page's button and the
// shelters page's issue link all point at it, and a rename that reached only
// two of the three would leave the third silently wrong.
export const REPO_URL = "https://github.com/fresh55/posvoji";
