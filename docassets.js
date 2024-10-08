// This content script contains the injector responsible for redirecting assets

/**** REDIRECT RULES ****/

// Base URL
const BASE_REDIRECT = "https://the-doctorpus.github.io/doc-assets";

// These URLs will never be redirected so
// we don't need to check them.
const EXCLUSION_REGEX = [
	// Misc. images
	/.+\/img\/(avatar|badges|stats|verified)/,
	// Terrain textures
	/.+\/assets\/packs\/\d+\/textures/,
];
// Rules for redirects
const REDIRECTS = [
	// Animations
	{
		regex:
			/.+\/assets\/animations\/(?<filename>[^?.]+\.(?:(?!json).)+)(?:\?.*)?$/,
		redirectUrl: `${BASE_REDIRECT}/images/default/animations/`,
	},
	// Characters
	{
		regex:
			/.+\/assets\/characters\/(?<filename>[^?.]+\.(?:(?!json).)+)(?:\?.*)?$/,
		redirectUrl: `${BASE_REDIRECT}/images/characters/`,
	},
	// Spritesheets
	{
		regex:
			/.+\/assets\/spritesheets\/(?<filename>[^?.]+\.(?:(?!json).)+)(?:\?.*)?$/,
		redirectUrl: `${BASE_REDIRECT}/images/default/spritesheets/`,
	},
	// Map spritesheets
	{
		regex: /.+\/assets\/packs\/(?<filename>[^?.]+\.(?:(?!json).)+)(?:\?.*)?$/,
		redirectUrl: `${BASE_REDIRECT}/images/default/mapmaker-asset-packs/`,
	},
	// Images (e.g. logo, menu background, loading screen background, etc.)
	{
		regex: /.+\/img\/(?<filename>[^?.]+\.(?:(?!json).)+)(?:\?.*)?$/,
		redirectUrl: `${BASE_REDIRECT}/images/img/`,
	},
	// Pets
	{
		regex: /.+\/custom\/pets\/(?<filename>[^?.]+\.(?:(?!json).)+)(?:\?.*)?$/,
		redirectUrl: `${BASE_REDIRECT}/images/custom/pets/`,
	},
	// Skins (old)
	{
		regex: /.+\/assets\/skins\/(?<filename>[^?.]+\.(?:(?!json).)+)(?:\?.*)?$/,
		redirectUrl: `${BASE_REDIRECT}/images/skans/`,
	},
	// Skins (new, these are on the CDN)
	{
		regex:
			/cdn\.deeeep\.io\/custom\/skins\/(?<filename>[^?.]+\.(?:(?!json).)+)(?:\?.*)?$/,
		redirectUrl: `${BASE_REDIRECT}/images/skans/custom/`,
		isCdnSkin: true,
	},
];

/**** UTILITY FUNCTIONS ****/

// Fancy console log
const obj2css = (obj) =>
	Object.entries(obj)
		.map(
			([property, value]) =>
				`${property
					.split(/(?=[A-Z])/)
					.join("-")
					.toLowerCase()}:${value}`,
		)
		.join(";");

console.log(
	"%c✔%cDoctorpus Assets loaded",
	obj2css({
		color: "#fff",
		background: "#10b981",
		fontSize: "125%",
		padding: "4px 8px",
	}),
	obj2css({
		color: "#fff",
		background: "#0b5393",
		fontSize: "125%",
		padding: "4px 12px",
	}),
);

// Some assets may be requested multiple times.
// We do not want to have to check if the URL
// is valid every single time as that would
// waste bandwidth and slow down requests.
const existenceCache = {};

// We can save some time by caching the URL that
// each original URL redirects to.
// This is then saved to localStorage to optimize
// load time in future page loads.
const redirectCache = JSON.parse(localStorage.getItem("redirectCache")) || {};
const setRedirectCache = (url, redirectUrl) => {
	if (redirectUrl == null) {
		delete redirectCache[url];
	} else {
		redirectCache[url] = redirectUrl;
	}
	localStorage.setItem("redirectCache", JSON.stringify(redirectCache));
};

// Synchronously test if a URL exists
// This is used for determining whether an asset
// should be redirected or not.
const testUrl = (url) => {
	if (existenceCache[url] != null) return existenceCache[url];

	const request = new XMLHttpRequest();
	request.open("GET", url, false);
	request.send(null);
	if (request.status >= 200 && request.status < 400) {
		existenceCache[url] = true;
		return true;
	}
	existenceCache[url] = false;
	return false;
};

// Create a new URL by replacing the original URL
// with the defined regular expression rules
const createNewUrl = (url_) => {
	// If the image is a base64 data URL, just return it
	if (url_.startsWith("data:")) return url_;

	// If the image is a relative URL,
	// convert it to an absolute one
	const url = url_.startsWith("http")
		? url_
		: Object.assign(new URL(url_, location.origin), { search: "" }).toString();
	let processedUrl = url;

	// If the URL is already cached, return it
	if (redirectCache[url] != null) {
		return redirectCache[url];
	}

	// EXLUSION_REGEX defines a list of URLs
	// that should never be redirected
	for (const rule of EXCLUSION_REGEX) {
		if (url.match(rule)) {
			return url;
		}
	}

	// Iterate through the redirect rules
	// and test if it can be redirected
	let regexMatched = false;
	for (const rule of REDIRECTS) {
		if (url.match(rule.regex)) {
			regexMatched = true;
			let { filename } = rule.regex.exec(url).groups;
			if (rule.isCdnSkin)
				filename = `${filename.split("-")[0]}.${filename.split(".").pop()}`;
			if (filename) {
				const newUrl = rule.redirectUrl + filename;
				const canRedirect = testUrl(newUrl);
				if (canRedirect) {
					processedUrl = newUrl;
				}
			}
		}
		if (regexMatched) break;
	}
	// Cache the result
	setRedirectCache(url, processedUrl);
	return processedUrl;
};

/**** REDIRECTOR ****/

// We need to modify a few function calls
// Checking every single function call is
// not the best idea and could be improved
// in the future.
const originalFunctionCall = Function.prototype.call;
Function.prototype.call = function (...args) {
	// The asset loader in PIXI.js will use
	// a service worker to load assets by default.
	//
	// We need to override this behavior on-the-fly
	// because service workers run in a separate
	// scope, and as a result, its fetch() cannot be
	// modified to redirect requests.
	if (args[0] && args[0].name === "loadTextures" && args[0].config) {
		args[0].config.preferWorkers = false;
	}

	// Redirect the "src" of every image before
	// Vue.js renders them on the DOM
	if (args[3]?.src) {
		args[3].src = createNewUrl(args[3].src);
	}

	// Pass the modified arguments to the original function call
	return originalFunctionCall.apply(this, args);
};

// Make a backup of the original fetch function,
// then modify the fetch function.
const originalFetch = fetch;
fetch = async (...args) => {
	args[0] = createNewUrl(args[0]);
	const res = await originalFetch.apply(this, args);
	if (!res.ok) {
		setRedirectCache(args[0], null);
	}
	return res;
};

/**** CUSTOM CSS ****/

// This COULD be done dynamically, but these rules are
// unlikely to change, therefore we can hardcode them
const customCSS = document.createElement("style");
customCSS.innerHTML = `
.home-page .home-bg {
    background-image: url(${BASE_REDIRECT}/images/img/dpbg6.png) !important;
}   
.pd-pearl .model__stand {
    background-image: url(${BASE_REDIRECT}/images/misc/pearl_stand_only.png) !important;
}
.pd-pearl .model__cover {
    background-image: url(${BASE_REDIRECT}/images/misc/pearl_cover.png) !important;
}
.loading-container {
    background-image: url(${BASE_REDIRECT}/images/img/loadingbg.png) !important;
}
`;
window.addEventListener("DOMContentLoaded", () => {
	document.querySelector("head").append(customCSS);
});
