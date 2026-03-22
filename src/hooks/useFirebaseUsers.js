/**
 * Custom hook to fetch users from Firebase Firestore
 */

import { useState, useEffect } from 'react';
import { users as mockUsers } from '../app/data/mockData';

export function useFirebaseUsers(useFirebase = false) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);

      if (useFirebase) {
        try {
          // Lazy load Firebase service
          const { userService } = await import('../services/firebaseService');
          const { data, error: fetchError } = await userService.getUsers();
          if (fetchError) {
            console.warn('Firebase fetch error, using mock data:', fetchError);
            setUsers(mockUsers);
          } else {
            setUsers(data.length > 0 ? data : mockUsers);
          }
        } catch (err) {
          console.error('Error fetching users:', err);
          setError(err.message);
          setUsers(mockUsers); // Fallback to mock data
        }
      } else {
        // Use mock data
        setUsers(mockUsers);
      }

      setLoading(false);
    };

    fetchUsers();
  }, [useFirebase]);

  return { users, loading, error };
}

