<?php
require 'database.php';



if ($_SERVER['REQUEST_METHOD'] == 'POST')
{
    if (isset($_POST['action']))
    {
        $action = $_POST['action'];

////////////////////////////////////////////////////////////////////////////////////////////////////////

        if ($action == 'create-room')
        {
                $room_name = $_POST['room_name'];
                $room_code = $_POST['room_code'];
        
                $sql = "INSERT INTO rooms (name, code) VALUES ('$room_name', '$room_code')";
        
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

        else if ($action == 'join-room')
        {

        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'leave-room')
        {

        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'get-lobby')
        {
                echo json_encode(['status' => 'success', 'data' => 'php says hi']);
        }

////////////////////////////////////////////////////////////////////////////////////////////////////////

        else if ($action == 'message')
        {
            
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
        echo json_encode(['status' => 'error', 'data' => 'Invalid request method']);
}


