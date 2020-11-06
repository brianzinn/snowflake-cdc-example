import { Storage } from '@google-cloud/storage';

export type CloudFile = {
    /**
     * bucket name used to store.
     */
    bucket: string
    /**
     * excludes path parts (ie: /tablename)
     */
    filename: string
    /**
     * includes full bucket path with filename.
     */
    path: string
    /**
     * If the file was pre-existing (not overwritten)
     */
    exists: boolean
}

export const storeToBucket = async (path: string, filename: string, fileContents: string): Promise<CloudFile> => {
    // TODO: same validations on binlog* params.
    if (path === undefined || path === null || path === '') {
        throw new Error('path must be supplied and non-null/empty/undefined');
    }

    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID
    });
    const bucketName = process.env.GOOGLE_BUCKET_NAME;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(`${path}/${filename}`);

    const [exists] = await file.exists();
    if (!exists) {
        await file.save(fileContents, {
            metadata: {
                contentType: 'text/plain'
            }
        });
    }

    return {
        bucket: bucketName,
        filename,
        path: file.name,
        exists
    }
}