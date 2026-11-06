export interface Organization {
  id: string;
  name: string;
}

export interface LoyaltyProgram {
  id: string;
  name: string;
  isActive: boolean;
}

export interface WalletBalance {
  walletId: string;
  programId?: string;
  name?: string;
  balance: number;
}

export interface CustomerCard {
  number: string;
  track?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  cards: CustomerCard[];
  walletBalances: WalletBalance[];
}

export interface WalletTransaction {
  id: string;
  customerId: string;
  walletId: string;
  /** Зміна балансу: >0 нарахування, <0 списання */
  sum: number;
  balanceAfter?: number;
  comment?: string;
  createdAt: string;
  revision: number;
}

export interface TransactionsPage {
  transactions: WalletTransaction[];
  /** Найбільша revision у відповіді (або вхідна, якщо нових немає) */
  maxRevision: number;
}

export interface WalletChange {
  customerId: string;
  walletId: string;
  sum: number;
  comment?: string;
}

/**
 * Єдиний інтерфейс до Syrve Cloud API. Реалізації: RealSyrveClient, MockSyrveClient.
 * Телефони — завжди у форматі +380XXXXXXXXX.
 */
export interface SyrveClient {
  getOrganizations(): Promise<Organization[]>;
  getPrograms(organizationId: string): Promise<LoyaltyProgram[]>;
  findCustomerByPhone(organizationId: string, phone: string): Promise<Customer | null>;
  getCustomer(organizationId: string, customerId: string): Promise<Customer | null>;
  createOrUpdateCustomer(
    organizationId: string,
    data: { id?: string; phone: string; name: string },
  ): Promise<string>;
  addCustomerToProgram(organizationId: string, customerId: string, programId: string): Promise<void>;
  addCard(organizationId: string, customerId: string, cardNumber: string): Promise<void>;
  topUp(organizationId: string, change: WalletChange): Promise<void>;
  chargeOff(organizationId: string, change: WalletChange): Promise<void>;
  getTransactionsByRevision(organizationId: string, revision: number): Promise<TransactionsPage>;
}

export class SyrveError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'SyrveError';
  }
}
