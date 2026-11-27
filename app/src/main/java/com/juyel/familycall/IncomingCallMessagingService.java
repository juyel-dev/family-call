package com.juyel.familycall;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Person;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class IncomingCallMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "family_incoming_calls";
    private static final int NOTIFICATION_ID = 2401;

    @Override
    public void onNewToken(String token) {
        PushRegistration.register(this);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        if (!"incoming_call".equals(message.getData().get("type"))) return;

        String callId = message.getData().get("callId");
        String callerName = message.getData().get("callerName");
        String callType = message.getData().get("callType");
        if (callId == null || callId.isEmpty()) return;
        if (callerName == null || callerName.isEmpty()) callerName = "Family contact";
        if (!"video".equals(callType)) callType = "audio";

        showIncomingCall(callId, callerName, callType);
    }

    private void showIncomingCall(String callId, String callerName, String callType) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        createChannel(manager);

        Intent incomingIntent = new Intent(this, IncomingCallActivity.class);
        incomingIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        incomingIntent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId);
        incomingIntent.putExtra(IncomingCallActivity.EXTRA_CALLER_NAME, callerName);
        incomingIntent.putExtra(IncomingCallActivity.EXTRA_CALL_TYPE, callType);
        PendingIntent fullScreen = PendingIntent.getActivity(
                this, callId.hashCode(), incomingIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent rejectIntent = new Intent(this, CallActionReceiver.class);
        rejectIntent.setAction(CallActionReceiver.ACTION_REJECT);
        rejectIntent.putExtra(CallActionReceiver.EXTRA_CALL_ID, callId);
        PendingIntent reject = PendingIntent.getBroadcast(
                this, callId.hashCode() + 1, rejectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent acceptIntent = new Intent(this, IncomingCallActivity.class);
        acceptIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        acceptIntent.putExtras(incomingIntent);
        PendingIntent accept = PendingIntent.getActivity(
                this, callId.hashCode() + 2, acceptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= 26) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        builder.setSmallIcon(android.R.drawable.sym_action_call)
                .setContentTitle(callerName)
                .setContentText("Incoming " + callType + " call")
                .setCategory(Notification.CATEGORY_CALL)
                .setPriority(Notification.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(false)
                .setFullScreenIntent(fullScreen, true)
                .setContentIntent(accept)
                .setColor(0xFF087F72);

        if (Build.VERSION.SDK_INT >= 31) {
            Person caller = new Person.Builder().setName(callerName).setImportant(true).build();
            builder.setStyle(Notification.CallStyle.forIncomingCall(caller, reject, accept));
        } else {
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Reject", reject);
            builder.addAction(android.R.drawable.sym_action_call, "Answer", accept);
        }

        manager.notify(NOTIFICATION_ID, builder.build());
    }

    private void createChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < 26 || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Incoming family calls", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Full-screen alerts for incoming Family Call calls.");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setBypassDnd(false);
        Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        channel.setSound(ringtone, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        manager.createNotificationChannel(channel);
    }
}
