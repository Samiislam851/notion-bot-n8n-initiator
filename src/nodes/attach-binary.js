// The HTTP node replaced the item with Notion's response; put the file back for the upload request.
const slot = $input.first().json;
return [{ json: { uploadId: slot.id }, binary: $('Current Document').first().binary }];
