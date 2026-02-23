import { EventEmitter } from "events";
import { SerialPort, ReadlineParser } from "serialport";

/** USB serial client for FluidNC. */
export class SerialClient extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;

  async listPorts(): Promise<string[]> {
    const list = await SerialPort.list();
    return list.map((p) => p.path);
  }

  async connect(path: string, baudRate = 115200): Promise<void> {
    await this.disconnect();
    this.port = new SerialPort({ path, baudRate, autoOpen: false });
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

    this.parser.on("data", (line: string) => {
      this.emit("data", line.trim());
    });

    await new Promise<void>((resolve, reject) => {
      this.port!.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`[Serial] Connected to ${path} @ ${baudRate}`);
  }

  async disconnect(): Promise<void> {
    if (this.port?.isOpen) {
      await new Promise<void>((resolve, reject) => {
        this.port!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    this.port = null;
    this.parser = null;
  }

  async send(data: string): Promise<void> {
    if (!this.port?.isOpen) throw new Error("Serial port not connected");
    await new Promise<void>((resolve, reject) => {
      this.port!.write(`${data}\n`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
