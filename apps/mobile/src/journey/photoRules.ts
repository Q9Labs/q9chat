/** Uploads are capped at 20 MB; a larger photo is refused before it is sent. */
export const MAX_PHOTO_BYTES = 20_000_000;
export const photoTooLargeNotice = "That photo is over 20 MB. Choose a smaller one.";
export const photoRejectedNotice = "Couldn't use that photo. Choose another one.";
export const photoTooLarge = (bytes: number) => bytes > MAX_PHOTO_BYTES;
