/**
 * Utility script to add test users to Firestore
 * Run this once to populate your database with test data
 */

import { users as mockUsers } from '../app/data/mockData.js';

export async function addTestUsersToFirestore() {
  console.log('Mock mode: no Firestore. Users are already in mockData.');
}

// To use this, call: addTestUsersToFirestore()

