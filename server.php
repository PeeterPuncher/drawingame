<?php
require 'database.php';

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

// Handle preflight (OPTIONS) requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS')
{
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] == 'POST')
{
        $data = json_decode(file_get_contents("php://input"), true);

    if (isset($data['action']))
    {
        $action = $data['action'];

////////////////////////////////////////////////////////////////////////////////////////////////////////
        
        if ($action == 'create-room')
        {
                $room_name = $data['room_name'];
                $room_code = $data['room_code'];
        
                if ($room_name != "")
                {
                        $sql = "INSERT INTO rooms (name, code) VALUES ('$room_name', '$room_code')";
                }
                else
                {
                        $sql = "INSERT INTO rooms (name, code) VALUES ('room $room_code', '$room_code')";
                }
                
        
                if (mysqli_query($conn, $sql))
                {
                        echo json_encode(['status' => 'success', 'data' => $room_code]);
                }
                else
                {
                        echo json_encode(['status' => 'error', 'data' => 'Error creating room']);
                }
        }

///////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'get-lobby')
        {
                $sql = "SELECT name, code FROM rooms";
                $rooms = array();

                $result = mysqli_query($conn, $sql);
                while ($row = mysqli_fetch_array($result))
                {
                        $sql2 = "SELECT COUNT(roomId) FROM players WHERE roomId = $row[code]";
                        $players = mysqli_query($conn, $sql2);

                        $rooms[] = ['name' => $row['name'], 'code' => $row['code'], 'players' => mysqli_fetch_array($players)[0]];
                }
                echo json_encode(['status'=> 'success','data'=> $rooms]);
        }

///////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'join-room')
        {
                $room_code = $data["room_code"];
                $user_name = $data["user_name"];

                if ($room_code != "0" && $user_name != "")
                {
                        $sql = "INSERT INTO `players`(`name`, `roomId`) VALUES ('$user_name','$room_code')";
                        if (mysqli_query($conn,$sql))
                        {
                                echo json_encode(["status"=> "success","data"=> $room_code]);
                        }
                }

        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'leave-room')
        {
                $user_name = $data["user_name"];

                if ($user_name != "")
                {
                        $sql = "DELETE FROM players WHERE name = '$user_name'";
                        if (mysqli_query($conn,$sql))
                        {
                                echo json_encode(["status"=> "success","data"=> "User left room"]);
                        }
                }
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == "delete-room")
        {
                $room_code = $data["room_code"];

                if ($room_code != "")
                {
                        $sql = "DELETE FROM rooms WHERE code = '$room_code'";
                        if (mysqli_query($conn,$sql))
                        {
                                echo json_encode(["status"=> "success","data"=> "Room deleted"]);
                        }
                }
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'message')
        {
            
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////
        
        else if ($action == "save-drawing")
        {
            $room_code = isset($data['room_code']) ? $data['room_code'] : 'unknown';
            $user_id = isset($data['userId']) ? $data['userId'] : 'unknown';
            $round = isset($data['round']) ? intval($data['round']) : 1;
            $uploadDir = 'drawings/' . $room_code . '/';
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
            $fileName = 'canvas_image_' . $user_id . '_r' . $round . '_' . time() . '.png';

            if (isset($data['image']))
            {
                $imageData = $data['image'];
                $imageData = str_replace('data:image/png;base64,', '', $imageData);
                $imageData = base64_decode($imageData);
                file_put_contents($uploadDir . $fileName, $imageData);

                echo json_encode(["status"=> "success","data"=> $fileName]);
            }
            else
            {
                echo json_encode(["status"=> "error","data"=> "Image upload failed"]);
            }
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////
        
        else if ($action == "list-drawings") {
            $room_code = $data['room_code'];
            $uploadDir = 'drawings/' . $room_code . '/';
            $images = [];
            if (is_dir($uploadDir)) {
                foreach (scandir($uploadDir) as $file) {
                    if ($file !== '.' && $file !== '..' && preg_match('/\.png$/', $file)) {
                        // Extract round from filename: canvas_image_{userId}_r{round}_{timestamp}.png
                        $round = 1;
                        if (preg_match('/canvas_image_[^_]+_r(\d+)_\d+\.png$/', $file, $m)) {
                            $round = intval($m[1]);
                        }
                        $images[] = ['path' => $uploadDir . $file, 'round' => $round];
                    }
                }
            }
            echo json_encode(["status" => "success", "data" => $images]);
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'get-room-players')
        {
            $room_code = $data["room_code"];
            $players = [];
            if ($room_code != "") {
                $sql = "SELECT name FROM players WHERE roomId = '$room_code'";
                $result = mysqli_query($conn, $sql);
                while ($row = mysqli_fetch_assoc($result)) {
                    $players[] = ['name' => $row['name']];
                }
            }
            echo json_encode(['status' => 'success', 'data' => $players]);
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'get-words')
        {
            $words = [];
            $sql = "SELECT nev FROM szavak";
            $result = mysqli_query($conn, $sql);
            while ($row = mysqli_fetch_assoc($result)) {
                $words[] = $row['nev'];
            }
            echo json_encode(['status' => 'success', 'data' => $words]);
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else
        {
                echo json_encode(['status' => 'error', 'data' => 'Invalid action']);   
        }
    }
    else
    {
        echo json_encode(['status' => 'error', 'data' => 'Invalid request']);
    }
}
else
{
        echo json_encode(['status'=> 'error', 'data'=> 'Invalid request']);
}


mysqli_close($conn);