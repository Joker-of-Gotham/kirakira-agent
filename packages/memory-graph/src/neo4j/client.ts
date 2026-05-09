import neo4j from "neo4j-driver";
import type { Driver, Session } from "neo4j-driver";

export class Neo4jClient {
  private readonly driver: Driver;
  private readonly database?: string;

  constructor(uri: string, username: string, password: string, database?: string) {
    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
    this.database = database;
  }

  getSession(): Session {
    return this.database != null && this.database !== "" ? this.driver.session({ database: this.database }) : this.driver.session();
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  getDriver(): Driver {
    return this.driver;
  }
}
