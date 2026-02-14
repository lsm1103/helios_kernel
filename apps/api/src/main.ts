import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: true
  });

  app.setGlobalPrefix("api");

  const port = Number(process.env.PORT ?? 1999);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`HELIOS API running on http://${host}:${port}/api`);
}

void bootstrap();
