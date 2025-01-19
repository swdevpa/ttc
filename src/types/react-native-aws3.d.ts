declare module 'react-native-aws3' {
  interface S3Options {
    keyPrefix?: string;
    bucket: string;
    region: string;
    accessKey: string;
    secretKey: string;
    successActionStatus?: number;
    contentType?: string;
    metadata?: Record<string, string>;
  }

  interface File {
    uri: string;
    name: string;
    type: string;
  }

  interface Response {
    status: number;
    text?: string;
    body: {
      postResponse: {
        location: string | null;
        bucket: string | null;
        key: string | null;
        etag: string | null;
      }
    }
  }

  export const RNS3: {
    put: (file: File, options: S3Options) => Promise<Response>;
  }
} 