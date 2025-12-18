import { DataSource, DataSourceOptions } from "typeorm";

export const dataSourceOptions: DataSourceOptions = {
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "admin@123",
  database: process.env.DB_NAME || "ksrDb",
  schema: "public",
  synchronize: false,
  ssl: process.env.DB_SSL === "true",
  entities: [__dirname + "/../entities/*.entity{.ts,.js}"],
  migrations: ["migrations/*{.ts,.js}"],
};

export const appDataSourceOptions: DataSourceOptions = {
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "admin@123",
  database: process.env.DB_NAME || "ksrDb",
  schema: "public",
  synchronize: false,
  ssl: process.env.DB_SSL === "true",
  entities: [__dirname + "/../entities/*.entity{.ts,.js}"],
};

export default new DataSource(dataSourceOptions);
