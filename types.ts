
export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF'
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  password?: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface ProductType {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  typeId: string;
  stock: number;
  updatedAt: string;
}

export enum TransactionType {
  IN = 'IN',
  OUT = 'OUT'
}

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  type: TransactionType;
  timestamp: string;
  userId: string;
  userName: string;
}

export interface AppState {
  currentUser: User | null;
  products: Product[];
  transactions: Transaction[];
  users: User[];
  categories: Category[];
  types: ProductType[];
}
