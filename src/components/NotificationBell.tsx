// src/components/NotificationBell.tsx
import React, { useState, useEffect } from 'react'; // Removed useCallback and useMemo as they are not used in this simplified version
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  writeBatch,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react'; // Import Lucide icons

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  linkTo?: string;
  isRead: boolean;
  createdAt: Timestamp;
  icon?: string;
  relatedEntityId?: string;
}

const NotificationBell: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const mapDocToNotification = (docSnapshot: any): Notification => {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      title: data.title || 'Notification',
      message: data.message || 'You have a new notification.',
      type: data.type || 'GENERAL',
      linkTo: data.linkTo,
      isRead: data.isRead || false,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
      icon: data.icon,
      relatedEntityId: data.relatedEntityId,
    };
  };

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const notificationsRef = collection(db, 'users', currentUser.uid, 'notifications');
    const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(20));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedNotifications: Notification[] = [];
      let currentUnreadCount = 0;
      querySnapshot.forEach((docData) => {
        const notification = mapDocToNotification(docData);
        fetchedNotifications.push(notification);
        if (!notification.isRead) {
          currentUnreadCount++;
        }
      });
      setNotifications(fetchedNotifications);
      setUnreadCount(currentUnreadCount);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching notifications: ", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleNotificationClick = async (notification: Notification) => {
    if (notification.linkTo) {
      navigate(notification.linkTo);
    }
    if (!notification.isRead && currentUser) {
      try {
        const notifRef = doc(db, 'users', currentUser.uid, 'notifications', notification.id);
        await updateDoc(notifRef, {
          isRead: true,
        });
        // Optimistic update or rely on onSnapshot
        setNotifications(prev => prev.map(n => n.id === notification.id ? {...n, isRead: true} : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Error marking notification as read: ", error);
      }
    }
    setIsOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    if (!currentUser || unreadCount === 0) return;

    const batch = writeBatch(db);
    const unreadNotifications = notifications.filter(n => !n.isRead);

    unreadNotifications.forEach(notification => {
      const notifRef = doc(db, 'users', currentUser.uid, 'notifications', notification.id);
      batch.update(notifRef, { isRead: true });
    });

    try {
      await batch.commit();
      setNotifications(prev => prev.map(n => ({...n, isRead: true})));
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all notifications as read: ", error);
    }
  };

  const timeSince = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    if (seconds < 5) return "just now";
    return Math.floor(seconds) + "s ago";
  };
  
  const notificationBellStyle: React.CSSProperties = {
    position: 'relative',
    cursor: 'pointer',
    color: 'var(--color-text-primary)',
    padding: '0.5rem', // Add some padding to make it easier to click
  };

  const badgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: '0px',        // Adjusted for better positioning with padding
    right: '0px',       // Adjusted for better positioning with padding
    background: 'var(--color-error)',
    color: 'white',
    borderRadius: '50%',
    padding: '1px 5px', // Slightly adjusted padding
    fontSize: '0.65rem', // Slightly smaller font for badge
    fontWeight: 'bold',
    display: unreadCount > 0 ? 'flex' : 'none', // Use flex for centering if number is multi-digit
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '16px', // Ensure badge has a minimum width
    height: '16px',   // Ensure badge has a minimum height
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 10px)', // Ensure panel doesn't overlap bell
    right: 0,
    width: '350px',
    maxHeight: '400px',
    overflowY: 'auto',
    backgroundColor: 'var(--color-background-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 1050, // Ensure it's above other content
    display: isOpen ? 'block' : 'none',
  };

  const notificationItemStyle: React.CSSProperties = {
    padding: '12px 15px',
    borderBottom: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  };
  
  const unreadNotificationItemStyle: React.CSSProperties = {
    ...notificationItemStyle,
    backgroundColor: 'var(--color-primary-light, #e0efff)',
    // fontWeight: 'bold', // Title is already bold, message is normal
  };

  const panelHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 15px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--color-background-grey)', // Use a slightly different bg for header
  };

  const markAllReadButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--color-primary)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0.25rem 0.5rem', // Add some padding
  };


  return (
    <div style={{ position: 'relative' }}>
      <div style={notificationBellStyle} onClick={() => setIsOpen(!isOpen)} title="Notifications">
        <Bell size={24} /> {/* Using Lucide Bell icon */}
        <span style={badgeStyle}>{unreadCount > 99 ? '99+' : unreadCount}</span> {/* Cap badge at 99+ */}
      </div>

      <div style={panelStyle}>
        <div style={panelHeaderStyle}>
            <h4 style={{margin: 0, fontSize: '1rem', color: 'var(--color-text-primary)'}}>Notifications</h4>
            {unreadCount > 0 && (
                <button style={markAllReadButtonStyle} onClick={handleMarkAllAsRead} title="Mark all as read">
                    <CheckCheck size={18} /> {/* Using Lucide CheckCheck icon */}
                    Mark all as read
                </button>
            )}
        </div>
        {isLoading && <div style={{padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)'}}>Loading notifications...</div>}
        {!isLoading && notifications.length === 0 && (
          <div style={{padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)'}}>You have no new notifications.</div>
        )}
        {!isLoading && notifications.length > 0 && (
          <div>
            {notifications.map(notif => (
              <div 
                key={notif.id} 
                style={notif.isRead ? notificationItemStyle : unreadNotificationItemStyle}
                onClick={() => handleNotificationClick(notif)}
                onMouseEnter={(e) => { if (notif.isRead) e.currentTarget.style.backgroundColor = 'var(--color-background-hover)'; }}
                onMouseLeave={(e) => { if (notif.isRead) e.currentTarget.style.backgroundColor = 'var(--color-background-card)'; }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
                    <strong style={{fontSize: '0.9rem', color: notif.isRead ? 'var(--color-text-secondary)' : 'var(--color-text-primary)'}}>{notif.title}</strong>
                    <span style={{fontSize: '0.75rem', color: 'var(--color-text-muted)'}}>{timeSince(notif.createdAt.toDate())}</span>
                </div>
                <p style={{fontSize: '0.85rem', margin: 0, color: notif.isRead ? 'var(--color-text-muted)' : 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>{notif.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationBell;
