import { ValveRepository } from '../repositories/valve.repository';

export class ValveService {
  private readonly repository = new ValveRepository();

  listByField(fieldId: string) {
    return this.repository.listByField(fieldId);
  }

  replaceForField(fieldId: string, valves: Array<{ number: number; name?: string }>) {
    return this.repository.replaceForField(fieldId, valves);
  }
}
