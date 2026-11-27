package com.juyel.familycall;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class ApiClient {
    public static final String BASE_URL = BuildConfig.SERVER_BASE_URL;

    private ApiClient() {}

    public static JSONObject post(String path, JSONObject body, String token) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(BASE_URL + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            if (token != null && !token.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
            }

            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300
                    ? connection.getInputStream() : connection.getErrorStream();
            StringBuilder response = new StringBuilder();
            if (stream != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) response.append(line);
                }
            }
            JSONObject json = response.length() == 0 ? new JSONObject() : new JSONObject(response.toString());
            if (status < 200 || status >= 300) {
                String message = json.optString("error", "The server could not complete the request.");
                throw new ApiException(status, message);
            }
            return json;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    public static final class ApiException extends Exception {
        public final int status;
        ApiException(int status, String message) {
            super(message);
            this.status = status;
        }
    }
}
