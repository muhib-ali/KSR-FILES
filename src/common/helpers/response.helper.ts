export class ResponseHelper {
  static success<T>(data: T, message: string, heading: string, statusCode = 200) {
    return {
      statusCode,
      status: true,
      message,
      heading,
      data,
    };
  }

  static errorWithStatus(
    statusCode: number,
    message: string,
    heading: string,
    data: any = null
  ) {
    return {
      statusCode,
      status: false,
      message,
      heading,
      data,
    };
  }
}
